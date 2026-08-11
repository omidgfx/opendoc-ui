from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health, name="opendoc-ai-health"),
    path("api/ai/models", views.models, name="opendoc-ai-models"),
    path("api/ai/chat", views.chat, name="opendoc-ai-chat"),
]
