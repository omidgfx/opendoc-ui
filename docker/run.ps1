[CmdletBinding()]
param(
    [string]$Version = '',
    [int]$Port = 0,
    [string]$ImageName = '',
    [string]$ContainerName = '',
    [string]$ConfigFile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-EnvironmentValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrEmpty($value)) {
        return $DefaultValue
    }
    return $value
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI was not found. Install Docker Desktop or Docker Engine first.'
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker is installed, but its daemon is not available.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -Path (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$package.version
}
if ([string]::IsNullOrWhiteSpace($ImageName)) {
    $ImageName = Get-EnvironmentValue -Name 'OPENDOC_IMAGE_NAME' -DefaultValue 'opendoc-ui'
}
if ([string]::IsNullOrWhiteSpace($ContainerName)) {
    $ContainerName = Get-EnvironmentValue -Name 'OPENDOC_CONTAINER_NAME' -DefaultValue 'opendoc-ui'
}
if ($Port -eq 0) {
    $configuredPort = Get-EnvironmentValue -Name 'OPENDOC_PORT' -DefaultValue '3000'
    if (-not [int]::TryParse($configuredPort, [ref]$Port)) {
        throw 'OPENDOC_PORT must be a numeric TCP port.'
    }
}
if ($Port -lt 1 -or $Port -gt 65535) {
    throw 'The container port must be between 1 and 65535.'
}
if ([string]::IsNullOrWhiteSpace($ConfigFile)) {
    $ConfigFile = Get-EnvironmentValue -Name 'OPENDOC_CONFIG_FILE' -DefaultValue (Join-Path $projectRoot 'docker/config.json')
}
if (-not [IO.Path]::IsPathRooted($ConfigFile)) {
    $ConfigFile = Join-Path $projectRoot $ConfigFile
}
$configPath = (Resolve-Path -LiteralPath $ConfigFile).Path
Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json | Out-Null

$restartPolicy = Get-EnvironmentValue -Name 'OPENDOC_RESTART_POLICY' -DefaultValue 'unless-stopped'
$image = "${ImageName}:$Version"
& docker image inspect $image *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker image $image was not found. Run docker/build.ps1 first."
}

& docker container inspect $ContainerName *> $null
if ($LASTEXITCODE -eq 0) {
    & docker rm --force $ContainerName *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not replace the existing $ContainerName container."
    }
}

$mount = "type=bind,source=$configPath,target=/usr/share/nginx/html/config.json,readonly"
$dockerArguments = @(
    'run',
    '--detach',
    '--name', $ContainerName,
    '--restart', $restartPolicy,
    '--publish', "${Port}:80",
    '--mount', $mount,
    $image
)
$containerId = & docker @dockerArguments
if ($LASTEXITCODE -ne 0) {
    throw "Docker failed to start $image."
}

Write-Host "$image is running as $ContainerName at http://localhost:$Port"
Write-Host "Container ID: $containerId"
