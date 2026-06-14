<#
    bootstrap.ps1 — install the pullback worker on a Windows machine (the school box).

    Run once, in an elevated PowerShell, from the worker/ folder:
        powershell -ExecutionPolicy Bypass -File .\bootstrap.ps1

    It will:
      1. create a venv and install the agent deps,
      2. check you've created config.toml,
      3. register a Scheduled Task that runs the worker at logon and keeps it alive
         (so it survives RealVNC disconnects — no need to stay logged in clicking).
#>

param(
    [string]$PythonExe = "python",
    [string]$TaskName  = "PullbackWorker"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "== Pullback worker setup ==" -ForegroundColor Cyan

# 1. venv + deps -------------------------------------------------------------
if (-not (Test-Path "$here\.venv")) {
    Write-Host "Creating venv..."
    & $PythonExe -m venv "$here\.venv"
}
$venvPy = "$here\.venv\Scripts\python.exe"
& $venvPy -m pip install --upgrade pip | Out-Null
& $venvPy -m pip install -r "$here\requirements.txt"

# NOTE: the science libs (numpy, blender_tissue_cartography, igl, pymeshlab, scikit-image,
# scipy, Pillow, tqdm) must be importable. If they live in your existing conda env, either
# point [tools].python at that env, or `pip install` them into this venv too.

# 2. config check ------------------------------------------------------------
if (-not (Test-Path "$here\config.toml")) {
    Copy-Item "$here\config.example.toml" "$here\config.toml"
    Write-Warning "Created config.toml from the example. EDIT IT (Supabase keys, capabilities, tool paths) then re-run."
    exit 1
}

# 3. scheduled task (auto-start, auto-restart) -------------------------------
$action = New-ScheduledTaskAction -Execute $venvPy `
    -Argument "`"$here\worker.py`" --config `"$here\config.toml`"" -WorkingDirectory $here

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -RunLevel Highest | Out-Null

Write-Host "Installed scheduled task '$TaskName'. Starting it now..." -ForegroundColor Green
Start-ScheduledTask -TaskName $TaskName

Write-Host "`nDone. The worker is running and will auto-start at logon." -ForegroundColor Green
Write-Host "Logs: run '$venvPy worker.py --config config.toml' in a terminal to watch live output."
