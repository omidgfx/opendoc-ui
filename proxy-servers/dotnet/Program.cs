using OpenDoc.SpecDownloader;

var builder = WebApplication.CreateBuilder(args);
var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
var bind = Environment.GetEnvironmentVariable("OPENDOC_BIND") ?? "0.0.0.0";
builder.WebHost.UseUrls($"http://{bind}:{port}");

var app = builder.Build();
app.MapOpenDocSpecDownloader(DownloaderConfig.FromEnvironment());
app.Run();
