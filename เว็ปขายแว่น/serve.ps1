# วางไฟล์นี้ไว้และรัน (ดับเบิลคลิก หรือ powershell -File serve.ps1) เพื่อเปิดเว็บผ่าน http://localhost:8080
# ไม่ต้องติดตั้ง Node.js/Python — ใช้ HttpListener ของ .NET ที่มากับ Windows อยู่แล้ว
param([int]$Port = 8080)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix (Ctrl+C to stop)"

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
  '.css'='text/css'; '.js'='application/javascript'; '.json'='application/json'
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.svg'='image/svg+xml'
  '.gif'='image/gif'; '.ico'='image/x-icon'; '.webp'='image/webp'
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    try {
      $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($path -eq '/') { $path = '/index.html' }
      $filePath = Join-Path $root ($path.TrimStart('/'))
      $filePath = [System.IO.Path]::GetFullPath($filePath)
      if (-not $filePath.StartsWith($root)) { $res.StatusCode = 403; $res.Close(); continue }
      if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $ct = $mime[$ext]
        if (-not $ct) { $ct = 'application/octet-stream' }
        $res.ContentType = $ct
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
