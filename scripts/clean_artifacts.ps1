$repos = @(
  "us-docker.pkg.dev/tribetrader/gcr.io/tribe",
  "us-docker.pkg.dev/tribetrader/gcr.io/notegenius",
  "us-docker.pkg.dev/notegeniusfamily/gcr.io/tribe"
)

foreach ($repo in $repos) {
  Write-Host "============================="
  Write-Host "Checking $repo..."
  
  $images = gcloud artifacts docker images list $repo --sort-by="~CREATE_TIME" --format="value(version)" 2>$null
  
  if ($null -eq $images -or [string]::IsNullOrWhiteSpace($images)) {
    Write-Host "No images found or repository doesn't exist."
    continue
  }
  
  if ($images -isnot [array]) {
    $images = @($images)
  }

  Write-Host "Total images found: $($images.Count)"

  if ($images.Count -le 1) {
    Write-Host "Only 1 image in $repo - nothing to clean."
    continue
  }
  
  $toDelete = $images[1..($images.Count - 1)]
  Write-Host "Deleting $($toDelete.Count) older image(s) in $repo..."
  
  foreach ($version in $toDelete) {
    if ([string]::IsNullOrWhiteSpace($version)) { continue }
    $fullPath = "${repo}@${version}"
    Write-Host " -> Deleting $fullPath"
    gcloud artifacts docker images delete $fullPath --quiet --delete-tags 2>&1 | Out-Null
  }
}
Write-Host "Cleanup complete!"
