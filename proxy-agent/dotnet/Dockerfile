FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src
COPY OpenDoc.ProxyAgent.csproj ./
RUN dotnet restore
COPY Program.cs ProxyAgent.cs ./
RUN dotnet publish -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine
WORKDIR /app
COPY --from=build /out ./
ENV PORT=8080 OPENDOC_BIND=0.0.0.0
EXPOSE 8080
USER 1654
ENTRYPOINT ["dotnet", "OpenDoc.ProxyAgent.dll"]
