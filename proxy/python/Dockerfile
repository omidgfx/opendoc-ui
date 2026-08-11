FROM python:3.13-alpine
WORKDIR /app
COPY app.py ./
ENV PORT=8080 OPENDOC_BIND=0.0.0.0
EXPOSE 8080
USER nobody
CMD ["python", "app.py"]
