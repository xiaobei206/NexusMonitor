NexusMonitor 2.0.2-fix1 patch

Apply this patch by extracting the ZIP into the existing project root:
  O:\6\NexusMonitor-2.0.2

Preserve paths and overwrite the matching files. Do not replace package.json or package-lock.json.
Do not delete HardwareService\Resources\PawnIO\IntelMCHBAR.bin; this patch does not contain or replace it.
No npm reinstall is required.

Fixes:
1. Correct .NET X86Base.CpuId named-tuple field access (Ebx/Edx/Ecx/Eax).
2. Fully qualify NexusMonitor's SensorValue model to resolve the LHM type collision.
3. Select the highest live GPU core/graphics clock rather than the first matching sensor;
   memory, bus and zero Effective Clock readings are excluded.
4. Expose the selected GPU clock sensor name in the API snapshot and the GPU-card tooltip.
5. Add C# and Node source-contract tests for the fixes.

After applying, run the full validation sequence supplied in chat. This patch remains version 2.0.2;
2.0.2-fix1 identifies the source hotfix bundle, not a separate installed application profile.


> Archived historical patch note. The 2.0.2-fix1 changes are already integrated into NexusMonitor 2.0.3; do not apply this patch over the 2.0.3 source.
