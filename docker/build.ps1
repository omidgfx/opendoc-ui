[CmdletBinding()]
param(
    [string]$Version = '',
    [string]$ImageName = ''
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

$disableAppleEmojis = Get-EnvironmentValue -Name 'VITE_DISABLE_APPLE_EMOJIS' -DefaultValue 'true'
$loadFromUrl = Get-EnvironmentValue -Name 'VITE_LOAD_FROM_URL' -DefaultValue 'false'
$specDownloader = Get-EnvironmentValue -Name 'VITE_SPEC_DOWNLOADER' -DefaultValue ''
$basePath = Get-EnvironmentValue -Name 'VITE_BASE_PATH' -DefaultValue '/'
$dockerfile = Join-Path $projectRoot 'docker/Dockerfile'
$versionedImage = "${ImageName}:$Version"
$latestImage = "${ImageName}:latest"

Write-Host "Building $versionedImage..."
$dockerArguments = @(
    'build',
    '--file', $dockerfile,
    '--tag', $versionedImage,
    '--tag', $latestImage,
    '--build-arg', "VITE_DISABLE_APPLE_EMOJIS=$disableAppleEmojis",
    '--build-arg', "VITE_LOAD_FROM_URL=$loadFromUrl",
    '--build-arg', "VITE_SPEC_DOWNLOADER=$specDownloader",
    '--build-arg', "VITE_BASE_PATH=$basePath",
    $projectRoot
)
& docker @dockerArguments
if ($LASTEXITCODE -ne 0) {
    throw "Docker failed to build $versionedImage."
}

Write-Host "Built $versionedImage and $latestImage."
