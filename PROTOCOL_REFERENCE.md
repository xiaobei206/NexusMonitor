# Turing Smart Screen 3.5 — Offline Protocol Reference

This document records the protocol behavior used by NexusMonitor 2.0.0. It is a technical reference, not a copy of the upstream implementation.

## Target device

| Property | Value |
|---|---|
| USB VID/PID | `1A86:5722` |
| PnP identity | `USB\VID_1A86&PID_5722\USB35INCHIPSV2` |
| Serial | `USB35INCHIPSV2` |
| Port used during acceptance | `COM3` |
| Hardware revision | Rev A |
| Panel | 3.5-inch, 480×320 landscape / 320×480 portrait |
| Current classification | `official-turing-3.5` |
| Sub-revision | `TURING_3_5` |
| HELLO response on target | zero bytes |

Do not run the original `UsbMonitor.exe` while NexusMonitor owns COM3.

## Serial parameters

NexusMonitor opens the port with:

- Baud rate: `115200`
- Data bits: `8`
- Parity: `None`
- Stop bits: `One`
- Handshake: `RequestToSend` (RTS/CTS)
- DTR: `true`
- Read timeout: `1300 ms`
- Write timeout: `5000 ms`
- Open attempts: 3, with 250 ms between attempts
- After open: 350 ms settle time, then input/output buffers are discarded
- HELLO read window: 1600 ms, up to six bytes

## Identity and HELLO

HELLO is six bytes of `0x45`.

Classification implemented by `TuringProtocol.ClassifyHello`:

| Response | Classification | Sub-revision | Identity label |
|---|---|---|---|
| 0 bytes | `NoResponse` | `TURING_3_5` | `official-turing-3.5` |
| six × `0x01` | `UsbMonitor35` | `USBMONITOR_3_5` | `usbmonitor-3.5` |
| six × `0x02` | `UsbMonitor5` | `USBMONITOR_5` | `usbmonitor-5` |
| six × `0x03` | `UsbMonitor7` | `USBMONITOR_7` | `usbmonitor-7` |
| 1–5 bytes, mixed bytes, or another first byte | `Unexpected` | `UNEXPECTED` | `unexpected` |

Official Turing 3.5 units can legally return zero bytes. NexusMonitor therefore accepts `NoResponse` only when the device identity is complete:

- PnP contains `VID_1A86&PID_5722`; and
- serial/PnP leaf equals `USB35INCHIPSV2`.

A zero-byte response from a partial identity is rejected.

## Six-byte command encoding

Every ordinary command uses packed-x fields:

```text
data[0] = (x >> 2) & 0xff
data[1] = ((x & 3) << 6) | ((y >> 4) & 0x3f)
data[2] = ((y & 15) << 4) | ((ex >> 6) & 0x0f)
data[3] = ((ex & 63) << 2) | ((ey >> 8) & 0x03)
data[4] = ey & 0xff
data[5] = command
```

`x,y` is the top-left coordinate and `ex,ey` is the inclusive end coordinate. For display commands NexusMonitor passes `ex = x + width - 1`, `ey = y + height - 1`.

Commands used:

| Command | Value |
|---|---:|
| SCREEN_OFF | 108 |
| SCREEN_ON | 109 |
| SET_BRIGHTNESS | 110 |
| SET_ORIENTATION | 121 |
| DISPLAY_BITMAP | 197 |

## Brightness

Brightness is a percentage and is converted to an inverted wire value:

```text
wire = (int)(255 - percent / 100.0 * 255)
```

- `0%` → wire `255` (darkest)
- `100%` → wire `0` (brightest)
- The wire value is placed in the packed-x field, not byte[4]:
  `EncodeCommand(wire, 0, 0, 0, 110)`.

Verified packets:

| Percent | Wire | Six bytes |
|---:|---:|---|
| 10% | 229 | `39400000006E` |
| 20% | 204 | `33000000006E` |
| 30% | 178 | `2C800000006E` |
| 70% | 76 | `13000000006E` |
| 100% | 0 | `00000000006E` |
| 0% | 255 | `3FC00000006E` |

Real-device tests used 20%, 30%, 10%, SCREEN_OFF, SCREEN_ON and restored 70%. The 0%/100% packets are covered by automated tests, not all by a dedicated visual brightness sweep.

## Screen power

```text
OFF: 00000000006C   (command 108)
ON:  00000000006D   (command 109)
```

SCREEN_OFF/SCREEN_ON were tested on the real device and the screen content disappeared/reappeared.

## Orientation

Orientation uses a **16-byte** packet, not the six-byte command encoder:

```text
command[5] = 121 (SET_ORIENTATION)
command[6] = 100 | 101 | 102 | 103
command[7] = width  >> 8
command[8] = width  & 0xff
command[9] = height >> 8
command[10] = height & 0xff
remaining bytes zero
write all 16 bytes
wait 150 ms
```

Frame sizes:

| Value | Name | Width | Height | Measured on target |
|---:|---|---:|---:|---|
| 100 | PORTRAIT | 320 | 480 | Upright portrait |
| 101 | REVERSE_PORTRAIT | 320 | 480 | Rotated 180° |
| 102 | LANDSCAPE | 480 | 320 | Rotated 180° |
| 103 | REVERSE_LANDSCAPE | 480 | 320 | Upright landscape for this installation |

Default for the current installation: **103**. The protocol values 100–103 are unchanged.

## Image transfer — DISPLAY_BITMAP

Flow:

1. Encode and write a six-byte DISPLAY_BITMAP header:
   - `x = patch.x`
   - `y = patch.y`
   - `ex = x + width - 1`
   - `ey = y + height - 1`
   - command = `197`
2. Convert pixels to **RGB565 little-endian**:
   ```text
   v = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3)
   byte0 = v & 0xff
   byte1 = v >> 8
   ```
3. Write the pixel bytes in chunks of `display_width * 8` bytes:
   - landscape 480 → 3840 bytes/chunk
   - portrait 320 → 2560 bytes/chunk
4. Do not add a fixed 20 ms delay; upstream does not require one.

Patch validation:

- width and height must be positive;
- patch must lie inside the current frame;
- decoded base64 length must be exactly `width * height * 2`;
- `visualVerified` is not set by a successful write.

Verified image tests:

- full 480×320 at orientation 103;
- full 320×480 at orientation 100;
- 16×8 partial patch around (100,100), colors/position correct;
- RGB565 little-endian colors correct;
- full-display-width chunking validated.

The renderer uses the same `pushTuringPatches` path for automatic image updates and manual test frames. The automatic refresh is no longer gated by `visualVerified`; it depends on `status.connected`.

## HELLO + connect behavior

`Connect()`:

1. Enumerates PnP COM devices and classifies the target.
2. Requires the target to look like a Turing device.
3. Opens the serial port with retries.
4. Sends six `0x45` and reads up to six bytes.
5. Rejects unexpected HELLO or zero-byte HELLO with incomplete identity.
6. Marks communication initialized.
7. Applies the requested orientation (default 103).
8. Does **not** auto-apply brightness.

`visualVerified` is reset on connect and on service restart. A manual `POST /api/turing/visual-verified` call sets it after human observation.

## Actual test matrix

| Area | Real device | Automated |
|---|---|---|
| HELLO/identity | zero-byte official 3.5 | 01/02/03/zero/mixed cases |
| Brightness | 10/20/30/70, OFF/ON | wire conversions and packets |
| Orientation | 100/101/102/103 | frame sizes, portrait predicate |
| Image | full 480/320, 16×8 patch | RGB565/chunk sizing |
| Long-run 30 min | **not done** | — |
| USB unplug/replug | **not done** | — |
| Multi-patch soak | **not done** | — |
| 0%/100% visual sweep | not a dedicated real sweep | packets tested |

## Upstream references

Repository: <https://github.com/mathoudebine/turing-smart-screen-python>

Pinned commit: `2b33ab4f00a096916dd6a1174441a53a7ec33b03`

Files consulted:

- `library/lcd/lcd_comm_rev_a.py` — `LcdCommRevA.SendCommand`, `SetBrightness`, `_hello`, `SetOrientation`, `DisplayPILImage`
- `library/lcd/lcd_comm.py` — orientation enum, serial open behavior
- `library/lcd/serialize.py` — `image_to_RGB565(..., "little")`, `chunked(rgb565le, width * 8)`
- Hardware revisions wiki: <https://github.com/mathoudebine/turing-smart-screen-python/wiki/Hardware-revisions>

License note: the upstream project is GPL-3.0-or-later. NexusMonitor does not copy its implementation; this document records protocol observations and independently written C# code. Do not copy upstream source into NexusMonitor without reviewing GPL obligations.

## Current known protocol risks

- Official 3.5 zero-byte HELLO depends on identity gating; do not remove the VID/PID + serial check.
- `visualVerified` is not a protocol response; it is a human attestation and is session-scoped.
- Long-running partial refresh, USB re-enumeration and hot-plug recovery are still unverified.
- The native Windows serial driver can retain a COM handle after a failed process exit; a stale HardwareService must be terminated before reconnecting.
