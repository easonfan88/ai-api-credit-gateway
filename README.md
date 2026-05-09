# AI API Credit Gateway v2

This is the upgraded MVP. It includes API docs, clearer API-key warning, real OpenAI playground support, and safer provider-error handling.

## Run

```cmd
cd C:\Users\Administrator\Downloads
tar -xf ai-api-credit-gateway-v2.zip
cd ai-api-credit-gateway-v2
npm run install-all
copy .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

## Add real OpenAI key

Edit `.env`:

```env
OPENAI_API_KEY=sk-proj-your-key
```

Restart:

```cmd
npm run dev
```

## PowerShell API test

```powershell
$apiKey = "PASTE_YOUR_AIGW_KEY_HERE"

$headers = @{
  "Authorization" = "Bearer $apiKey"
  "Content-Type" = "application/json"
}

$body = @{
  model = "mock-fast"
  messages = @(
    @{
      role = "user"
      content = "Say hello from my API gateway."
    }
  )
} | ConvertTo-Json -Depth 10

$response = Invoke-RestMethod -Uri "http://localhost:4242/v1/chat/completions" -Method POST -Headers $headers -Body $body

$response.choices[0].message.content
```
