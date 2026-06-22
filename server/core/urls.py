from django.urls import path
from core import views

urlpatterns = [
    # Web views
    path('', views.dashboard_view, name='dashboard'),
    path('register/', views.register_view, name='register'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    
    # Web actions
    path('printer/<int:printer_id>/toggle/', views.printer_toggle_view, name='printer_toggle'),
    path('printer/<int:printer_id>/delete/', views.printer_delete_view, name='printer_delete'),
    path('job/<int:job_id>/retry/', views.job_retry_view, name='job_retry'),
    path('job/<int:job_id>/cancel/', views.job_cancel_view, name='job_cancel'),
    path('job/<int:job_id>/delete/', views.job_delete_view, name='job_delete'),
    path('api/status/', views.api_status_json_view, name='api_status_json'),

    # Agent API endpoints
    path('api/agent/login/', views.agent_login_api, name='agent_login'),
    path('api/agent/printers/register/', views.agent_register_printers_api, name='agent_register_printers'),
    path('api/agent/heartbeat/', views.agent_heartbeat_api, name='agent_heartbeat'),
    path('api/agent/jobs/', views.agent_jobs_api, name='agent_jobs'),
    path('api/agent/job/<int:job_id>/download/', views.agent_download_job_api, name='agent_download_job'),
    path('api/agent/job/<int:job_id>/status/', views.agent_update_job_status_api, name='agent_update_job_status'),

    # Canvas routes
    path('canvas/', views.canvas_editor_view, name='canvas_editor'),
    path('canvas/print/', views.canvas_print_api, name='canvas_print'),
]
