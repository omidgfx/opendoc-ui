FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /src
COPY pom.xml ./
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /src/target/spec-downloader-0.1.0.jar /app/downloader.jar
ENV PORT=8080 OPENDOC_BIND=0.0.0.0
EXPOSE 8080
USER 10001:10001
ENTRYPOINT ["java", "-jar", "/app/downloader.jar"]
