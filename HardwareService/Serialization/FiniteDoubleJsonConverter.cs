using System.Text.Json;
using System.Text.Json.Serialization;

namespace NexusMonitor.HardwareService.Serialization;

/// <summary>
/// Keeps a single invalid floating-point sample from breaking an entire snapshot
/// response. JSON has no NaN or Infinity numeric literals, so non-finite values
/// are represented as null rather than as strings or fabricated zeroes.
/// </summary>
public sealed class FiniteDoubleJsonConverter : JsonConverter<double>
{
    public override double Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.Number)
            throw new JsonException("Expected a JSON number.");

        var value = reader.GetDouble();
        if (!double.IsFinite(value))
            throw new JsonException("A JSON number must be finite.");
        return value;
    }

    public override void Write(Utf8JsonWriter writer, double value, JsonSerializerOptions options)
    {
        if (double.IsFinite(value)) writer.WriteNumberValue(value);
        else writer.WriteNullValue();
    }
}
