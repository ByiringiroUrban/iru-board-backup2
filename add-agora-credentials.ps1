# PowerShell script to add Agora credentials to .env file
# Run this script from the backend directory: .\add-agora-credentials.ps1

$envFile = ".\.env"

# Check if .env file exists
if (-not (Test-Path $envFile)) {
    Write-Host "Error: .env file not found in backend directory" -ForegroundColor Red
    exit 1
}

# Agora credentials
$agoraAppId = "AGORA_APP_ID=fade4719e0674d82a0e261b683295ff3"
$agoraCertificate = "AGORA_APP_CERTIFICATE=985ab79aa34b4136960731a5e61bea2f"
$agoraProjectName = "AGORA_PROJECT_NAME=IRU-Board"

# Read existing .env content
$content = Get-Content $envFile -Raw

# Check if credentials already exist
if ($content -match "AGORA_APP_ID") {
    Write-Host "Agora credentials already exist in .env file" -ForegroundColor Yellow
    Write-Host "Updating existing values..." -ForegroundColor Yellow
    
    # Replace existing values
    $content = $content -replace "AGORA_APP_ID=.*", $agoraAppId
    $content = $content -replace "AGORA_APP_CERTIFICATE=.*", $agoraCertificate
    $content = $content -replace "AGORA_PROJECT_NAME=.*", $agoraProjectName
} else {
    Write-Host "Adding Agora credentials to .env file..." -ForegroundColor Green
    
    # Append new credentials
    if ($content -notmatch "`n$") {
        $content += "`n"
    }
    $content += "`n# Agora Video SDK`n"
    $content += "$agoraAppId`n"
    $content += "$agoraCertificate`n"
    $content += "$agoraProjectName`n"
}

# Write back to file
Set-Content -Path $envFile -Value $content -NoNewline

Write-Host "`nAgora credentials have been added/updated successfully!" -ForegroundColor Green
Write-Host "Please restart your backend server for changes to take effect." -ForegroundColor Yellow


