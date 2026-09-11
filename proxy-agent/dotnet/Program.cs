using OpenDoc.ProxyAgent;

var builder = WebApplication.CreateBuilder(args);
var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
var bind = Environment.GetEnvironmentVariable("OPENDOC_BIND") ?? "0.0.0.0";
builder.WebHost.UseUrls($"http://{bind}:{port}");

var app = builder.Build();
app.MapOpenDocProxyAgent(ProxyAgentConfig.FromEnvironment());
app.Run();
