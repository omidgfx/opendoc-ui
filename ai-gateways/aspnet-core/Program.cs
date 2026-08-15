using OpenDoc.AiGateway;

var config = GatewayConfig.FromEnvironment();
var builder = WebApplication.CreateBuilder(args);
var port = Environment.GetEnvironmentVariable("PORT") ?? "8787";
var bind = Environment.GetEnvironmentVariable("AI_GATEWAY_BIND") ?? "0.0.0.0";
builder.WebHost.UseUrls($"http://{bind}:{port}");

var app = builder.Build();
app.Use((context, next) => GatewayEndpoints.CorsMiddleware(context, config, next));
app.MapOpenDocAiGateway(config);
app.Run();
