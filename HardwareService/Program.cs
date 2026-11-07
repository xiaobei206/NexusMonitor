using NexusMonitor.HardwareService.Display;
using NexusMonitor.HardwareService.Monitoring;
using NexusMonitor.HardwareService.Models;
using NexusMonitor.HardwareService.Serialization;
using System.Text.Json.Serialization;

var builder=WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:18765");
builder.Logging.SetMinimumLevel(LogLevel.Information);
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.Services.ConfigureHttpJsonOptions(o=>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    // LHM/WMI providers may expose NaN or Infinity for unsupported or transient
    // readings. Keep the entire API response valid JSON and represent those values
    // as null instead of failing every /api/snapshot request.
    o.SerializerOptions.Converters.Add(new FiniteDoubleJsonConverter());
});
builder.Services.AddSingleton<HardwareMonitor>();
builder.Services.AddSingleton<NetworkMonitor>();
builder.Services.AddSingleton<StorageMonitor>();
builder.Services.AddSingleton<WeatherService>();
builder.Services.AddSingleton<TuringDisplayService>();
var app=builder.Build();
app.Use(async (ctx,next)=>{ctx.Response.Headers.Append("X-Content-Type-Options","nosniff");await next();});
app.MapGet("/api/health",()=>Results.Ok(new{ok=true,service="NexusMonitor Hardware Service",version="2.2.4"}));
app.MapGet("/api/snapshot",(HardwareMonitor hw,NetworkMonitor net,StorageMonitor storage)=>Results.Ok(hw.Snapshot(net,storage)));
app.MapGet("/api/storage/status",(StorageMonitor storage)=>Results.Ok(storage.GetStatus()));
app.MapGet("/api/devices",(NetworkMonitor net,StorageMonitor storage,HardwareMonitor hw)=>Results.Ok(new{networks=net.Read(),snapshot=hw.Snapshot(net,storage)}));
app.MapGet("/api/weather", async (string? location, WeatherService weather, CancellationToken ct) =>
{
    var result = await weather.GetAsync(location ?? "suzhou", "open-meteo", null, ct);
    return result is null ? Results.StatusCode(StatusCodes.Status503ServiceUnavailable) : Results.Ok(result);
});
app.MapPost("/api/weather", async (WeatherRequest request, WeatherService weather, CancellationToken ct) =>
{
    var result = await weather.GetAsync(request.Location, request.Source, request.ApiKey, ct);
    return result is null ? Results.StatusCode(StatusCodes.Status503ServiceUnavailable) : Results.Ok(result);
});
app.MapGet("/api/turing/devices",(TuringDisplayService turing)=>Results.Ok(new{devices=turing.Devices(),status=turing.Status}));
app.MapGet("/api/turing/status",(TuringDisplayService turing)=>Results.Ok(turing.Status));
app.MapPost("/api/turing/connect",(TuringConnectRequest req,TuringDisplayService turing)=>Results.Ok(turing.Connect(req.Port,req.Orientation)));
app.MapPost("/api/turing/disconnect",(TuringDisplayService turing)=>Results.Ok(turing.Disconnect()));
app.MapPost("/api/turing/orientation",(TuringOrientationRequest req,TuringDisplayService turing)=>Results.Ok(turing.SetOrientation(req.Orientation)));
app.MapPost("/api/turing/brightness",(TuringBrightnessRequest req,TuringDisplayService turing)=>Results.Ok(turing.SetBrightness(req.Brightness)));
app.MapPost("/api/turing/screen-power",(TuringScreenPowerRequest req,TuringDisplayService turing)=>Results.Ok(turing.SetScreenPower(req.On)));
app.MapPost("/api/turing/visual-verified",(TuringVisualVerificationRequest req,TuringDisplayService turing)=>Results.Ok(turing.MarkVisualVerified(req.Verified)));
app.MapPost("/api/turing/patches",(TuringPatchBatch batch,TuringDisplayService turing)=>Results.Ok(turing.SendPatches(batch.Patches)));
app.Lifetime.ApplicationStopping.Register(()=>{try{app.Services.GetRequiredService<HardwareMonitor>().Dispose();}catch{}try{app.Services.GetRequiredService<TuringDisplayService>().Dispose();}catch{}});
app.Run();
