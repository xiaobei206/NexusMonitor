using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NexusMonitor.HardwareService.Models;

namespace NexusMonitor.HardwareService.Monitoring;

/// <summary>
/// Normalizes six selectable weather providers into one snapshot contract. Provider credentials are
/// supplied by the desktop main process at request time and are never persisted by this service.
/// All local weather times are normalized to the China Standard Time offset (+08:00).
/// </summary>
public sealed class WeatherService
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(12) };
    private WeatherSnapshot? _cache;
    private string? _cacheKey;
    private DateTime _cachedAt;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ILogger<WeatherService> _logger;
    private readonly Dictionary<string, (string Key, DateTimeOffset ExpiresAt)> _weatherCnLocationCache = new(StringComparer.OrdinalIgnoreCase);

    public WeatherService(ILogger<WeatherService> logger) => _logger = logger;

    public async Task<WeatherSnapshot?> GetAsync(string location, string source, string? apiKey, string? apiSecret = null, string? apiHost = null, bool forceRefresh = false, CancellationToken ct = default)
    {
        var normalizedLocation = location.Equals("wujiang", StringComparison.OrdinalIgnoreCase) ? "wujiang" : "suzhou";
        var normalizedSource = NormalizeSource(source);
        if (((normalizedSource is "qweather" or "weathercn") && string.IsNullOrWhiteSpace(apiKey))
            || (normalizedSource == "qweather" && string.IsNullOrWhiteSpace(apiHost))
            || (normalizedSource == "caiyun" && (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(apiSecret)))
            || ((normalizedSource is "weatherapi" or "openweather") && string.IsNullOrWhiteSpace(apiKey)))
        {
            _logger.LogWarning("Weather source {Source} was selected but has no API key", normalizedSource);
            return null;
        }
        var keyHash = string.IsNullOrWhiteSpace(apiKey) ? "public" : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(apiKey))).Substring(0, 12);
        var secretHash = string.IsNullOrWhiteSpace(apiSecret) ? "none" : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(apiSecret))).Substring(0, 12);
        var cacheKey = $"{normalizedLocation}:{normalizedSource}:{keyHash}:{secretHash}:{apiHost}";
        if (!forceRefresh && _cache is not null && DateTime.UtcNow - _cachedAt < TimeSpan.FromMinutes(12) && cacheKey == _cacheKey) return _cache;

        await _gate.WaitAsync(ct);
        try
        {
            if (!forceRefresh && _cache is not null && DateTime.UtcNow - _cachedAt < TimeSpan.FromMinutes(12) && cacheKey == _cacheKey) return _cache;
            var (name, latitude, longitude) = normalizedLocation == "wujiang"
                ? ("苏州·吴江", 31.16, 120.64)
                : ("苏州", 31.2989, 120.5853);

            WeatherSnapshot? result = normalizedSource switch
            {
                "open-meteo" => await GetOpenMeteoAsync(name, latitude, longitude, ct),
                "qweather" => await GetQWeatherAsync(name, latitude, longitude, apiKey!, apiHost!, ct),
                "weathercn" => await GetWeatherCnAsync(name, latitude, longitude, apiKey!, ct),
                "caiyun" => await GetCaiyunAsync(name, latitude, longitude, apiKey!, apiSecret!, ct),
                "weatherapi" => await GetWeatherApiAsync(name, latitude, longitude, apiKey!, ct),
                "openweather" => await GetOpenWeatherAsync(name, latitude, longitude, apiKey!, ct),
                _ => null,
            };
            if (result is not null)
            {
                _cache = result;
                _cacheKey = cacheKey;
                _cachedAt = DateTime.UtcNow;
            }
            return result ?? (!forceRefresh && cacheKey == _cacheKey ? _cache : null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError("Weather request failed for {Location} using {Source}: {ErrorType}", normalizedLocation, normalizedSource, ex.GetType().Name);
            return !forceRefresh && cacheKey == _cacheKey ? _cache : null;
        }
        finally { _gate.Release(); }
    }

    private static string NormalizeSource(string? source) => source?.Trim().ToLowerInvariant() switch
    {
        "qweather" => "qweather",
        "weathercn" => "weathercn",
        "caiyun" => "caiyun",
        "weatherapi" => "weatherapi",
        "openweather" => "openweather",
        _ => "open-meteo",
    };

    private static JsonElement P(JsonElement element, string name) => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) ? value : default;
    private static int Length(JsonElement element) => element.ValueKind == JsonValueKind.Array ? element.GetArrayLength() : 0;
    private static JsonElement A(JsonElement element, int index) => element.ValueKind == JsonValueKind.Array && index >= 0 && index < element.GetArrayLength() ? element[index] : default;
    private static double? N(JsonElement element) => element.ValueKind == JsonValueKind.Number && double.IsFinite(element.GetDouble()) ? element.GetDouble() : null;
    private static double? N(JsonElement element, string name) => N(P(element, name));
    // Explicit AQI/pollutant accessor retained as part of the weather contract.
    // Values remain nullable doubles, exactly as defined by WeatherSnapshot.
    private static double? D(JsonElement element, string name) => N(element, name);
    private static int? I(JsonElement element) => element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var value) ? value : null;
    private static int? I(JsonElement element, string name) => I(P(element, name));
    private static string? S(JsonElement element) => element.ValueKind == JsonValueKind.String ? element.GetString() : null;
    private static string? S(JsonElement element, string name) => S(P(element, name));

    private static DateTimeOffset? ParseLocalTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();
        // ISO timestamps with an explicit offset/Z are already unambiguous.
        if (text.EndsWith('Z') || text.Contains('+') || (text.LastIndexOf('-') > 9 && text.Contains('T')))
            return DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var offset) ? offset : null;
        if (!DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var local))
            return null;
        return new DateTimeOffset(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeSpan.FromHours(8));
    }

    private static DateTimeOffset? ParseUnix(JsonElement element)
    {
        var value = I(element);
        if (value is null) return null;
        try { return DateTimeOffset.FromUnixTimeSeconds(value.Value).ToOffset(TimeSpan.FromHours(8)); }
        catch { return null; }
    }

    private static DateTimeOffset? ParseClock(string? date, string? clock)
    {
        if (string.IsNullOrWhiteSpace(date) || string.IsNullOrWhiteSpace(clock)) return null;
        if (!DateTime.TryParse($"{date} {clock}", CultureInfo.GetCultureInfo("en-US"), DateTimeStyles.AllowWhiteSpaces, out var local)) return null;
        return new DateTimeOffset(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeSpan.FromHours(8));
    }

    private static async Task<JsonDocument> FetchAsync(string url, CancellationToken ct, Action<HttpRequestMessage>? configure = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        configure?.Invoke(request);
        using var response = await Http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        return await JsonDocument.ParseAsync(stream, cancellationToken: ct);
    }

    private static Task<JsonDocument> FetchBearerAsync(string url, string token, CancellationToken ct) =>
        FetchAsync(url, ct, request => request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token));

    private static int? Percent(JsonElement element, string name)
    {
        var value = N(element, name);
        if (value is null) return null;
        return (int)Math.Round(value.Value <= 1 ? value.Value * 100 : value.Value, MidpointRounding.AwayFromZero);
    }

    private static double? KmPerHour(JsonElement element, string name) => N(element, name) is double value ? value * 3.6 : null;

    private static int? MapWeatherApiCode(int? code)
    {
        if (code is null) return null;
        return code.Value switch
        {
            1000 => 0, 1003 => 2, 1006 or 1009 => 3,
            1030 or 1135 or 1147 => 45,
            1063 or 1150 or 1153 or 1168 or 1171 or 1180 or 1183 or 1198 or 1204 => 61,
            1186 or 1189 or 1240 => 80,
            1192 or 1195 or 1201 or 1207 or 1243 or 1246 => 65,
            1066 or 1069 or 1072 or 1114 or 1117 or 1210 or 1213 or 1216 or 1219 or 1222 or 1225 or 1255 or 1258 => 71,
            1087 or 1273 or 1276 or 1279 or 1282 => 95,
            _ when code.Value >= 1273 => 95,
            _ => 3,
        };
    }

    private static int? MapOpenWeatherCode(int? id)
    {
        if (id is null) return null;
        var value = id.Value;
        if (value is >= 200 and < 300) return 95;
        if (value is >= 300 and < 400) return 51;
        if (value is >= 500 and < 600) return value >= 502 ? 65 : 61;
        if (value is >= 600 and < 700) return 71;
        if (value is >= 700 and < 800) return 45;
        if (value == 800) return 0;
        if (value is 801 or 802) return 2;
        return 3;
    }

    private static int? MapQWeatherCode(string? code)
    {
        if (!int.TryParse(code, out var value)) return null;
        if (value == 100) return 0;
        if (value is >= 101 and <= 103) return 2;
        if (value == 104) return 3;
        if (value is >= 200 and <= 213) return 95;
        if (value is >= 300 and <= 399) return value >= 305 ? 65 : 61;
        if (value is >= 400 and <= 499) return 71;
        if (value is >= 500 and <= 515) return 45;
        return 3;
    }

    private async Task<WeatherSnapshot?> GetOpenMeteoAsync(string name, double lat, double lon, CancellationToken ct)
    {
        var coordinates = $"latitude={lat.ToString(CultureInfo.InvariantCulture)}&longitude={lon.ToString(CultureInfo.InvariantCulture)}";
        var weatherUrl = $"https://api.open-meteo.com/v1/forecast?{coordinates}" +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m" +
            "&hourly=temperature_2m,precipitation_probability,weather_code" +
            "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&forecast_days=7&forecast_hours=36&timezone=Asia%2FShanghai";
        var airUrl = $"https://air-quality-api.open-meteo.com/v1/air-quality?{coordinates}&current=pm10,pm2_5,ozone,nitrogen_dioxide,us_aqi&timezone=Asia%2FShanghai";
        var weatherTask = FetchAsync(weatherUrl, ct);
        var airTask = FetchAsync(airUrl, ct);
        using var w = await weatherTask;
        JsonDocument? airDoc = null;
        // Air quality is optional: an AQI failure must not invalidate current weather or forecasts.
        // Preserve caller cancellation, but treat every independent AQI failure as non-fatal.
        try { airDoc = await airTask; }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        { _logger.LogWarning("Open-Meteo air-quality request failed for {Location}: {ErrorType}; current weather remains available", name, ex.GetType().Name); }
        using (airDoc)
        {
            var root = w.RootElement;
            var current = P(root, "current");
            var air = airDoc is null ? default : P(airDoc.RootElement, "current");
            var daily = P(root, "daily");
            var dailyTimes = P(daily, "time");
            var maxima = P(daily, "temperature_2m_max");
            var minima = P(daily, "temperature_2m_min");
            var codes = P(daily, "weather_code");
            var rain = P(daily, "precipitation_probability_max");
            var wind = P(daily, "wind_speed_10m_max");
            var sunrise = ParseLocalTime(S(A(P(daily, "sunrise"), 0)));
            var sunset = ParseLocalTime(S(A(P(daily, "sunset"), 0)));
            var currentTime = ParseLocalTime(S(P(current, "time"))) ?? DateTimeOffset.Now;
            // Open-Meteo returns seven calendar days including today; retain the next six future days for the vertical HUD detail card.
            var dailyForecast = new List<WeatherDaySnapshot>(6);
            for (var i = 0; i < 7 && dailyForecast.Count < 6; i++)
            {
                var date = ParseLocalTime(S(A(dailyTimes, i)));
                if (date is null || date.Value.Date <= currentTime.Date) continue;
                dailyForecast.Add(new WeatherDaySnapshot(date.Value, N(A(maxima, i)), N(A(minima, i)), I(A(codes, i)), I(A(rain, i)), N(A(wind, i))));
            }
            var hourly = P(root, "hourly");
            var hours = new List<WeatherHourSnapshot>();
            var times = P(hourly, "time");
            for (var i = 0; i < Length(times) && hours.Count < 6; i++)
            {
                var time = ParseLocalTime(S(A(times, i)));
                if (time is null || time <= currentTime) continue;
                hours.Add(new WeatherHourSnapshot(time.Value, N(A(P(hourly, "temperature_2m"), i)), I(A(P(hourly, "precipitation_probability"), i)), I(A(P(hourly, "weather_code"), i))));
            }
            return new WeatherSnapshot(name, DateTimeOffset.UtcNow, N(current, "temperature_2m"), N(current, "apparent_temperature"), N(current, "relative_humidity_2m"), N(current, "wind_speed_10m"), N(current, "wind_direction_10m"), N(current, "precipitation"), I(current, "weather_code"), D(air, "us_aqi"), D(air, "pm2_5"), D(air, "pm10"), D(air, "ozone"), D(air, "nitrogen_dioxide"), "Open-Meteo", N(A(maxima, 0)), N(A(minima, 0)), hours.FirstOrDefault()?.PrecipitationProbability, hours, dailyForecast, sunrise, sunset, "US-EPA");
        }
    }

    private async Task<WeatherSnapshot?> GetWeatherApiAsync(string name, double lat, double lon, string apiKey, CancellationToken ct)
    {
        var url = $"https://api.weatherapi.com/v1/forecast.json?key={Uri.EscapeDataString(apiKey)}&q={lat.ToString(CultureInfo.InvariantCulture)},{lon.ToString(CultureInfo.InvariantCulture)}&days=7&aqi=yes&alerts=no";
        using var doc = await FetchAsync(url, ct);
        var root = doc.RootElement;
        var current = P(root, "current");
        var forecast = P(root, "forecast");
        var daysRoot = P(forecast, "forecastday");
        var currentTime = ParseUnix(P(current, "last_updated_epoch")) ?? DateTimeOffset.Now;
        var currentDay = A(daysRoot, 0);
        var currentDate = S(currentDay, "date");
        var currentAstro = P(currentDay, "astro");
        var sunrise = ParseClock(currentDate, S(currentAstro, "sunrise"));
        var sunset = ParseClock(currentDate, S(currentAstro, "sunset"));
        var hours = new List<WeatherHourSnapshot>();
        for (var d = 0; d < Length(daysRoot) && hours.Count < 6; d++)
        {
            var day = A(daysRoot, d); var dayHours = P(day, "hour");
            for (var h = 0; h < Length(dayHours) && hours.Count < 6; h++)
            {
                var hour = A(dayHours, h);
                var time = ParseUnix(P(hour, "time_epoch")) ?? ParseLocalTime(S(hour, "time"));
                if (time is null || time <= currentTime) continue;
                hours.Add(new WeatherHourSnapshot(time.Value, N(hour, "temp_c"), I(hour, "chance_of_rain"), MapWeatherApiCode(I(P(hour, "condition"), "code"))));
            }
        }
        var daily = new List<WeatherDaySnapshot>();
        for (var d = 1; d < Length(daysRoot) && daily.Count < 6; d++)
        {
            var day = A(daysRoot, d); var values = P(day, "day");
            var date = ParseLocalTime(S(day, "date"));
            if (date is null) continue;
            daily.Add(new WeatherDaySnapshot(date.Value, N(values, "maxtemp_c"), N(values, "mintemp_c"), MapWeatherApiCode(I(P(values, "condition"), "code")), I(values, "daily_chance_of_rain"), N(values, "maxwind_kph")));
        }
        var aqi = P(current, "air_quality");
        var day0 = P(currentDay, "day");
        return new WeatherSnapshot(name, DateTimeOffset.UtcNow, N(current, "temp_c"), N(current, "feelslike_c"), N(current, "humidity"), N(current, "wind_kph"), N(current, "wind_degree"), N(current, "precip_mm"), MapWeatherApiCode(I(P(current, "condition"), "code")), null, N(aqi, "pm2_5"), N(aqi, "pm10"), N(aqi, "o3"), N(aqi, "no2"), "WeatherAPI", N(day0, "maxtemp_c"), N(day0, "mintemp_c"), hours.FirstOrDefault()?.PrecipitationProbability, hours, daily, sunrise, sunset);
    }

    private async Task<WeatherSnapshot?> GetOpenWeatherAsync(string name, double lat, double lon, string apiKey, CancellationToken ct)
    {
        var key = Uri.EscapeDataString(apiKey);
        var weatherUrl = $"https://api.openweathermap.org/data/3.0/onecall?lat={lat.ToString(CultureInfo.InvariantCulture)}&lon={lon.ToString(CultureInfo.InvariantCulture)}&appid={key}&units=metric&lang=zh_cn&exclude=minutely,alerts";
        using var w = await FetchAsync(weatherUrl, ct);
        var root = w.RootElement;
        var current = P(root, "current");
        var now = ParseUnix(P(current, "dt")) ?? DateTimeOffset.Now;
        var hours = new List<WeatherHourSnapshot>();
        var hourly = P(root, "hourly");
        for (var i = 0; i < Length(hourly) && hours.Count < 6; i++)
        {
            var hour = A(hourly, i); var time = ParseUnix(P(hour, "dt"));
            if (time is null || time <= now) continue;
            hours.Add(new WeatherHourSnapshot(time.Value, N(hour, "temp"), N(hour, "pop") is double pop ? (int)Math.Round(pop * 100) : null, MapOpenWeatherCode(I(P(A(P(hour, "weather"), 0), "id")))));
        }
        var days = new List<WeatherDaySnapshot>();
        var daily = P(root, "daily");
        for (var i = 1; i < Length(daily) && days.Count < 6; i++)
        {
            var day = A(daily, i); var temp = P(day, "temp"); var date = ParseUnix(P(day, "dt"));
            if (date is null) continue;
            days.Add(new WeatherDaySnapshot(date.Value, N(temp, "max"), N(temp, "min"), MapOpenWeatherCode(I(P(A(P(day, "weather"), 0), "id"))), N(day, "pop") is double pop ? (int)Math.Round(pop * 100) : null, N(day, "wind_speed") is double wind ? wind * 3.6 : null));
        }
        JsonDocument? airDoc = null;
        // Air quality is optional: an AQI failure must not invalidate current weather or forecasts.
        // Preserve caller cancellation, but treat every independent AQI failure as non-fatal.
        try { airDoc = await FetchAsync($"https://api.openweathermap.org/data/2.5/air_pollution?lat={lat.ToString(CultureInfo.InvariantCulture)}&lon={lon.ToString(CultureInfo.InvariantCulture)}&appid={key}", ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex) { _logger.LogWarning("OpenWeather air-quality request failed for {Location}: {ErrorType}; current weather remains available", name, ex.GetType().Name); }
        using (airDoc)
        {
            var air = airDoc is null ? default : A(P(airDoc.RootElement, "list"), 0);
            var components = P(air, "components");
            return new WeatherSnapshot(name, DateTimeOffset.UtcNow, N(current, "temp"), N(current, "feels_like"), N(current, "humidity"), N(current, "wind_speed") is double wind ? wind * 3.6 : null, N(current, "wind_deg"), N(P(current, "rain"), "1h"), MapOpenWeatherCode(I(P(A(P(current, "weather"), 0), "id"))), null, N(components, "pm2_5"), N(components, "pm10"), N(components, "o3"), N(components, "no2"), "OpenWeather", N(P(A(daily, 0), "temp"), "max"), N(P(A(daily, 0), "temp"), "min"), hours.FirstOrDefault()?.PrecipitationProbability, hours, days, ParseUnix(P(current, "sunrise")), ParseUnix(P(current, "sunset")));
        }
    }


    private static bool IndexHasCode(JsonElement indexes, string code)
    {
        for (var i = 0; i < Length(indexes); i++)
            if (string.Equals(S(A(indexes, i), "code"), code, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    private async Task<WeatherSnapshot?> GetQWeatherAsync(string name, double lat, double lon, string token, string apiHost, CancellationToken ct)
    {
        var host = apiHost.Trim().TrimEnd('/');
        if (!Uri.TryCreate("https://" + host, UriKind.Absolute, out var parsedHost)
            || parsedHost.Host != host || !parsedHost.Host.EndsWith(".qweatherapi.com", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("QWeather API Host must be your assigned *.qweatherapi.com hostname.");
        var root = $"https://{host}";
        var latitude = lat.ToString("0.##", CultureInfo.InvariantCulture);
        var longitude = lon.ToString("0.##", CultureInfo.InvariantCulture);
        var coordinate = $"{latitude}/{longitude}";
        var currentTask = FetchBearerAsync($"{root}/weather/v1/current/{coordinate}?localTime=true&lang=zh", token, ct);
        var hourlyTask = FetchBearerAsync($"{root}/weather/v1/hourly/{coordinate}?hours=240&localTime=true&lang=zh", token, ct);
        var dailyTask = FetchBearerAsync($"{root}/weather/v1/daily/{coordinate}?days=7&localTime=true&lang=zh", token, ct);
        var airTask = FetchBearerAsync($"{root}/airquality/v1/current/{coordinate}?lang=zh", token, ct);
        using var currentDoc = await currentTask;
        using var hourlyDoc = await hourlyTask;
        using var dailyDoc = await dailyTask;
        JsonDocument? airDoc = null;
        try { airDoc = await airTask; }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex) { _logger.LogWarning("QWeather V1 air-quality request failed for {Location}: {ErrorType}; weather remains available", name, ex.GetType().Name); }
        using (airDoc)
        {
            var current = currentDoc.RootElement;
            var hourlyRoot = P(hourlyDoc.RootElement, "hours");
            var dailyRoot = P(dailyDoc.RootElement, "days");
            var airRoot = airDoc?.RootElement ?? default;
            var now = DateTimeOffset.Now;
            var hours = new List<WeatherHourSnapshot>();
            for (var i = 0; i < Length(hourlyRoot) && hours.Count < 6; i++)
            {
                var hour = A(hourlyRoot, i);
                var time = ParseLocalTime(S(hour, "forecastTime"));
                if (time is null || time <= now) continue;
                hours.Add(new WeatherHourSnapshot(time.Value,
                    N(P(hour, "temperature"), "value"),
                    Percent(P(hour, "precipitation"), "probability"),
                    int.TryParse(S(P(hour, "condition"), "code"), out var code) ? MapQWeatherCode(code.ToString(CultureInfo.InvariantCulture)) : null));
            }
            var days = new List<WeatherDaySnapshot>();
            for (var i = 1; i < Length(dailyRoot) && days.Count < 6; i++)
            {
                var day = A(dailyRoot, i);
                var date = ParseLocalTime(S(day, "forecastStartTime")) ?? ParseLocalTime(S(day, "forecastStart")) ?? ParseLocalTime(S(day, "date"));
                if (date is null) continue;
                days.Add(new WeatherDaySnapshot(date.Value,
                    N(P(day, "temperatureMax"), "value"),
                    N(P(day, "temperatureMin"), "value"),
                    int.TryParse(S(P(P(day, "daytime"), "condition"), "code"), out var code) ? MapQWeatherCode(code.ToString(CultureInfo.InvariantCulture)) : null,
                    Percent(P(P(day, "daytime"), "precipitation"), "probability"),
                    KmPerHour(P(P(P(day, "daytime"), "wind"), "speed"), "value")));
            }
            var firstDay = A(dailyRoot, 0);
            var firstDate = ParseLocalTime(S(firstDay, "forecastStartTime")) ?? now;
            var astronomy = P(firstDay, "astro");
            var sunriseText = S(astronomy, "sunrise");
            var sunsetText = S(astronomy, "sunset");
            var sunrise = ParseLocalTime(sunriseText) ?? ParseClock(firstDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), sunriseText);
            var sunset = ParseLocalTime(sunsetText) ?? ParseClock(firstDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), sunsetText);
            var indexes = P(airRoot, "indexes");
            var preferredAqiCode = IndexHasCode(indexes, "cn-mee") ? "cn-mee" : "us-epa";
            double? aqi = null;
            for (var i = 0; i < Length(indexes); i++)
            {
                var item = A(indexes, i);
                if (string.Equals(S(item, "code"), preferredAqiCode, StringComparison.OrdinalIgnoreCase)) { aqi = N(item, "aqi"); break; }
            }
            var pollutants = P(airRoot, "pollutants");
            double? pollutant(string code)
            {
                for (var i = 0; i < Length(pollutants); i++)
                {
                    var item = A(pollutants, i);
                    if (string.Equals(S(item, "code"), code, StringComparison.OrdinalIgnoreCase)) return N(P(item, "concentration"), "value");
                }
                return null;
            }
            var condition = P(current, "condition");
            return new WeatherSnapshot(name, DateTimeOffset.UtcNow,
                N(P(current, "temperature"), "value"),
                N(P(current, "feelsLike"), "value"),
                N(current, "humidity") is double humidity ? humidity * 100 : null,
                KmPerHour(P(P(current, "wind"), "speed"), "value"),
                N(P(P(current, "wind"), "direction"), "degree"),
                N(P(P(current, "precipitation"), "amount"), "value"),
                int.TryParse(S(condition, "code"), out var currentCode) ? MapQWeatherCode(currentCode.ToString(CultureInfo.InvariantCulture)) : null,
                aqi, pollutant("pm2p5"), pollutant("pm10"), pollutant("o3"), pollutant("no2"),
                "QWeather", N(P(firstDay, "temperatureMax"), "value"), N(P(firstDay, "temperatureMin"), "value"),
                hours.FirstOrDefault()?.PrecipitationProbability, hours, days, sunrise, sunset,
                IndexHasCode(indexes, "cn-mee") ? "China-MEP" : "US-EPA", "https://developer.qweather.com/attribution.html");
        }
    }

    private async Task<string> GetWeatherCnLocationKeyAsync(string name, double lat, double lon, string apiKey, CancellationToken ct)
    {
        if (_weatherCnLocationCache.TryGetValue(name, out var cached) && cached.ExpiresAt > DateTimeOffset.UtcNow) return cached.Key;
        var query = $"{lat.ToString("0.000", CultureInfo.InvariantCulture)},{lon.ToString("0.000", CultureInfo.InvariantCulture)}";
        var url = $"https://openapi.weathercn.com/locations/v1/cities/geoposition/search.json?q={Uri.EscapeDataString(query)}&language=zh-cn";
        using var document = await FetchAsync(url, ct, request => request.Headers.TryAddWithoutValidation("X-Gw-API-Key", apiKey));
        var key = S(A(document.RootElement, 0), "Key");
        if (string.IsNullOrWhiteSpace(key)) throw new InvalidOperationException("WeatherCN location lookup did not return a Location Key.");
        _weatherCnLocationCache[name] = (key, DateTimeOffset.UtcNow.AddHours(24));
        return key;
    }

    private static double? WeatherCnMetric(JsonElement element, string name) => N(P(P(element, name), "Metric"), "Value");

    private static int? MapWeatherCnCode(int? icon)
    {
        if (icon is null) return null;
        var code = icon.Value;
        if (code is >= 1 and <= 6) return 0;
        if (code is 7 or 8 or 38) return 3;
        if (code == 11) return 45;
        if (code is >= 12 and <= 14 or 18 or 39 or 40) return 61;
        if (code is 15 or 16 or 17 or 41 or 42) return 95;
        if (code is >= 19 and <= 29 or 43 or 44) return 71;
        if (code == 32) return 45;
        if (code is >= 33 and <= 37) return 0;
        return 3;
    }

    private async Task<WeatherSnapshot?> GetWeatherCnAsync(string name, double lat, double lon, string apiKey, CancellationToken ct)
    {
        var locationKey = await GetWeatherCnLocationKeyAsync(name, lat, lon, apiKey, ct);
        var root = "https://openapi.weathercn.com";
        var currentTask = FetchAsync($"{root}/currentconditions/v1/{locationKey}.json?language=zh-cn&details=true", ct, request => request.Headers.TryAddWithoutValidation("X-Gw-API-Key", apiKey));
        var hourlyTask = FetchAsync($"{root}/forecasts/v1/hourly/24hour/{locationKey}.json?language=zh-cn&metric=true", ct, request => request.Headers.TryAddWithoutValidation("X-Gw-API-Key", apiKey));
        var dailyTask = FetchAsync($"{root}/forecasts/v1/daily/10day/{locationKey}.json?language=zh-cn&details=true&metric=true", ct, request => request.Headers.TryAddWithoutValidation("X-Gw-API-Key", apiKey));
        var airTask = FetchAsync($"{root}/airquality/v1/global/observations/{locationKey}.json?language=zh-cn", ct, request => request.Headers.TryAddWithoutValidation("X-Gw-API-Key", apiKey));
        using var currentDoc = await currentTask;
        using var hourlyDoc = await hourlyTask;
        using var dailyDoc = await dailyTask;
        JsonDocument? airDoc = null;
        try { airDoc = await airTask; }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex) { _logger.LogWarning("WeatherCN air-quality request failed for {Location}: {ErrorType}; weather remains available", name, ex.GetType().Name); }
        using (airDoc)
        {
            var current = A(currentDoc.RootElement, 0);
            var hourly = hourlyDoc.RootElement;
            var daily = P(dailyDoc.RootElement, "DailyForecasts");
            var air = airDoc?.RootElement ?? default;
            var now = DateTimeOffset.Now;
            var hours = new List<WeatherHourSnapshot>();
            for (var i = 0; i < Length(hourly) && hours.Count < 6; i++)
            {
                var hour = A(hourly, i);
                var time = ParseLocalTime(S(hour, "DateTime")) ?? ParseUnix(P(hour, "EpochDateTime"));
                if (time is null || time <= now) continue;
                hours.Add(new WeatherHourSnapshot(time.Value, N(P(hour, "Temperature"), "Value"),
                    I(hour, "PrecipitationProbability"), MapWeatherCnCode(I(hour, "WeatherIcon"))));
            }
            var days = new List<WeatherDaySnapshot>();
            for (var i = 1; i < Length(daily) && days.Count < 6; i++)
            {
                var day = A(daily, i);
                var date = ParseLocalTime(S(day, "Date")) ?? ParseUnix(P(day, "EpochDate"));
                if (date is null) continue;
                var daytime = P(day, "Day");
                var precipitation = P(day, "Day");
                days.Add(new WeatherDaySnapshot(date.Value,
                    N(P(P(day, "Temperature"), "Maximum"), "Value"),
                    N(P(P(day, "Temperature"), "Minimum"), "Value"),
                    MapWeatherCnCode(I(daytime, "Icon")),
                    I(precipitation, "PrecipitationProbability"),
                    N(P(P(daytime, "Wind"), "Speed"), "Value")));
            }
            var today = A(daily, 0);
            var sun = P(today, "Sun");
            var sunrise = ParseLocalTime(S(sun, "Rise"));
            var sunset = ParseLocalTime(S(sun, "Set"));
            var aqi = N(air, "Index");
            return new WeatherSnapshot(name, DateTimeOffset.UtcNow,
                WeatherCnMetric(current, "Temperature"),
                WeatherCnMetric(current, "RealFeelTemperature"),
                N(current, "RelativeHumidity"),
                N(P(P(P(current, "Wind"), "Speed"), "Metric"), "Value"),
                N(P(P(current, "Wind"), "Direction"), "Degrees"),
                N(P(P(P(current, "PrecipitationSummary"), "PastHour"), "Metric"), "Value"),
                MapWeatherCnCode(I(current, "WeatherIcon")),
                aqi,
                N(air, "ParticulateMatter2_5"), N(air, "ParticulateMatter10"),
                N(air, "Ozone"), N(air, "NitrogenDioxide"),
                "WeatherCN · 华风爱科",
                N(P(P(today, "Temperature"), "Maximum"), "Value"),
                N(P(P(today, "Temperature"), "Minimum"), "Value"),
                hours.FirstOrDefault()?.PrecipitationProbability, hours, days, sunrise, sunset, "China-MEP", "https://platform.weathercn.com/");
        }
    }

    private static string EncodeCaiyunComponent(string value) =>
        Uri.EscapeDataString(value).Replace("%20", "+", StringComparison.OrdinalIgnoreCase);

    private static int? MapCaiyunCode(string? skycon)
    {
        if (string.IsNullOrWhiteSpace(skycon)) return null;
        return skycon.ToUpperInvariant() switch
        {
            "CLEAR_DAY" or "CLEAR_NIGHT" => 0,
            "PARTLY_CLOUDY_DAY" or "PARTLY_CLOUDY_NIGHT" => 2,
            "CLOUDY" => 3,
            "LIGHT_HAZE" or "MODERATE_HAZE" or "HEAVY_HAZE" or "FOG" => 45,
            "LIGHT_RAIN" => 61,
            "MODERATE_RAIN" => 63,
            "HEAVY_RAIN" or "STORM_RAIN" => 65,
            "LIGHT_SNOW" => 71,
            "MODERATE_SNOW" => 73,
            "HEAVY_SNOW" => 75,
            "DUST" or "SAND" or "WIND" => 45,
            _ => 3,
        };
    }

    private static (double Latitude, double Longitude) ToGcj02(double latitude, double longitude)
    {
        if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) return (latitude, longitude);
        const double a = 6378245.0;
        const double ee = 0.00669342162296594323;
        static double TransformLat(double x, double y) =>
            -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.Sqrt(Math.Abs(x))
            + (20 * Math.Sin(6 * x * Math.PI) + 20 * Math.Sin(2 * x * Math.PI)) * 2 / 3
            + (20 * Math.Sin(y * Math.PI) + 40 * Math.Sin(y / 3 * Math.PI)) * 2 / 3
            + (160 * Math.Sin(y / 12 * Math.PI) + 320 * Math.Sin(y * Math.PI / 30)) * 2 / 3;
        static double TransformLon(double x, double y) =>
            300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.Sqrt(Math.Abs(x))
            + (20 * Math.Sin(6 * x * Math.PI) + 20 * Math.Sin(2 * x * Math.PI)) * 2 / 3
            + (20 * Math.Sin(x * Math.PI) + 40 * Math.Sin(x / 3 * Math.PI)) * 2 / 3
            + (150 * Math.Sin(x / 12 * Math.PI) + 300 * Math.Sin(x / 30 * Math.PI)) * 2 / 3;
        var dLat = TransformLat(longitude - 105, latitude - 35);
        var dLon = TransformLon(longitude - 105, latitude - 35);
        var radLat = latitude / 180 * Math.PI;
        var magic = Math.Sin(radLat);
        magic = 1 - ee * magic * magic;
        var sqrtMagic = Math.Sqrt(magic);
        dLat = dLat * 180 / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
        dLon = dLon * 180 / (a / sqrtMagic * Math.Cos(radLat) * Math.PI);
        return (latitude + dLat, longitude + dLon);
    }

    private async Task<WeatherSnapshot?> GetCaiyunAsync(string name, double lat, double lon, string appKey, string appSecret, CancellationToken ct)
    {
        var coordinate = ToGcj02(lat, lon);
        var lonText = coordinate.Longitude.ToString("0.####", CultureInfo.InvariantCulture);
        var latText = coordinate.Latitude.ToString("0.####", CultureInfo.InvariantCulture);
        var path = $"/v2.6/{Uri.EscapeDataString(appKey)}/{lonText},{latText}/weather";
        var query = new SortedDictionary<string, string>(StringComparer.Ordinal)
        {
            ["alert"] = "false", ["dailysteps"] = "7", ["hourlysteps"] = "24",
        };
        var queryString = string.Join("&", query.Select(pair => $"{EncodeCaiyunComponent(pair.Key)}={EncodeCaiyunComponent(pair.Value)}"));
        var nonce = Guid.NewGuid().ToString("N");
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
        var signingText = $"GET:{path}:{queryString}:{appKey}:{nonce}:{timestamp}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
        var signature = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(signingText)))
            .Replace('+', '-').Replace('/', '_');
        var url = $"https://api.caiyunapp.com{path}?{queryString}";
        using var document = await FetchAsync(url, ct, request =>
        {
            request.Headers.TryAddWithoutValidation("x-cy-nonce", nonce);
            request.Headers.TryAddWithoutValidation("x-cy-timestamp", timestamp);
            request.Headers.TryAddWithoutValidation("x-cy-signature", signature);
        });
        var root = document.RootElement;
        if (!string.Equals(S(root, "status"), "ok", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Caiyun API returned a non-ok status.");
        var result = P(root, "result");
        var realtime = P(result, "realtime");
        var hourly = P(result, "hourly");
        var daily = P(result, "daily");
        var now = ParseUnix(P(root, "server_time")) ?? DateTimeOffset.Now;
        var hours = new List<WeatherHourSnapshot>();
        var hourTemps = P(hourly, "temperature");
        var hourPrecip = P(hourly, "precipitation");
        var hourSky = P(hourly, "skycon");
        for (var i = 0; i < Length(hourTemps) && hours.Count < 6; i++)
        {
            var temp = A(hourTemps, i);
            var time = ParseLocalTime(S(temp, "datetime")) ?? ParseLocalTime(S(A(hourSky, i), "datetime"));
            if (time is null || time <= now) continue;
            hours.Add(new WeatherHourSnapshot(time.Value, N(temp, "value"),
                Percent(A(hourPrecip, i), "probability"),
                MapCaiyunCode(S(A(hourSky, i), "value"))));
        }
        var days = new List<WeatherDaySnapshot>();
        var dayTemps = P(daily, "temperature");
        var dayPrecip = P(daily, "precipitation");
        var daySky = P(daily, "skycon");
        for (var i = 1; i < Length(dayTemps) && days.Count < 6; i++)
        {
            var temp = A(dayTemps, i);
            var time = ParseLocalTime(S(temp, "date")) ?? ParseLocalTime(S(A(daySky, i), "date"));
            if (time is null) continue;
            days.Add(new WeatherDaySnapshot(time.Value, N(temp, "max"), N(temp, "min"),
                MapCaiyunCode(S(A(daySky, i), "value")),
                Percent(A(dayPrecip, i), "probability"), null));
        }
        var air = P(realtime, "air_quality");
        var aqi = P(air, "aqi");
        var sunrise = ParseLocalTime(S(A(P(daily, "astro"), 0), "sunrise"));
        var sunset = ParseLocalTime(S(A(P(daily, "astro"), 0), "sunset"));
        return new WeatherSnapshot(name, DateTimeOffset.UtcNow,
            N(realtime, "temperature"), N(realtime, "apparent_temperature"),
            N(realtime, "humidity") is double humidity ? humidity * 100 : null,
            N(P(realtime, "wind"), "speed") is double wind ? wind * 3.6 : null,
            N(P(realtime, "wind"), "direction"),
            N(P(P(realtime, "precipitation"), "local"), "intensity"),
            MapCaiyunCode(S(realtime, "skycon")),
            N(aqi, "chn") ?? N(aqi, "usa"), N(air, "pm25"), N(air, "pm10"), N(air, "o3"), N(air, "no2"),
            "Caiyun · 彩云天气",
            N(A(dayTemps, 0), "max"), N(A(dayTemps, 0), "min"),
            hours.FirstOrDefault()?.PrecipitationProbability, hours, days, sunrise, sunset, N(aqi, "chn") is not null ? "China-MEP" : "US-EPA");
    }

}
