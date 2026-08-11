FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src
COPY OpenDoc.AiGateway.csproj ./
RUN dotnet restore
COPY Program.cs Gateway.cs ./
RUN dotnet publish -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine
WORKDIR /app
COPY --from=build /out ./
ENV PORT=8787 AI_GATEWAY_BIND=0.0.0.0
EXPOSE 8787
USER 1654
ENTRYPOINT ["dotnet", "OpenDoc.AiGateway.dll"]
