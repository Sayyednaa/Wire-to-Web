import os
import json
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm
from django.http import JsonResponse, FileResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.core import signing
from django.utils import timezone
from datetime import timedelta
from django.db import models

from core.models import Printer, Document, PrintJob
from core.forms import UserRegistrationForm, DocumentUploadForm, PrintJobCreationForm

# --- File Cleanup Utilities ---

def cleanup_old_files():
    """
    Cleans up files on disk:
    1. Deletes files for completed jobs immediately (safety check).
    2. Deletes files for failed/cancelled jobs older than 24 hours.
    3. Deletes orphaned documents older than 24 hours.
    """
    cutoff = timezone.now() - timedelta(hours=24)
    
    # 1. Clean up files for completed jobs
    completed_jobs = PrintJob.objects.filter(status='COMPLETED')
    for job in completed_jobs:
        if job.document and job.document.file:
            try:
                if os.path.exists(job.document.file.path):
                    os.remove(job.document.file.path)
                job.document.file.name = ""
                job.document.save()
            except Exception:
                pass

    # 2. Clean up failed/cancelled jobs older than 24 hours
    old_jobs = PrintJob.objects.filter(
        status__in=['FAILED', 'CANCELLED'],
        created_at__lt=cutoff
    )
    for job in old_jobs:
        if job.document and job.document.file:
            try:
                if os.path.exists(job.document.file.path):
                    os.remove(job.document.file.path)
                job.document.file.name = ""
                job.document.save()
            except Exception:
                pass

    # 3. Clean up orphaned documents older than 24 hours
    orphaned_docs = Document.objects.filter(
        uploaded_at__lt=cutoff,
        print_jobs__isnull=True
    )
    for doc in orphaned_docs:
        if doc.file:
            try:
                if os.path.exists(doc.file.path):
                    os.remove(doc.file.path)
            except Exception:
                pass
        doc.delete()


# --- Web Views ---

def home_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    return render(request, 'core/landing.html')


def privacy_view(request):
    return render(request, 'core/privacy_policy.html')


def terms_view(request):
    return render(request, 'core/terms_of_service.html')


def register_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    
    if request.method == 'POST':
        form = UserRegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect('dashboard')
    else:
        form = UserRegistrationForm()
    return render(request, 'core/register.html', {'form': form})


def login_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard')

    if request.method == 'POST':
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            return redirect('dashboard')
    else:
        form = AuthenticationForm()
    return render(request, 'core/login.html', {'form': form})


def logout_view(request):
    logout(request)
    return redirect('login')


@login_required
def dashboard_view(request):
    # Run cleanup of files to prevent storage buildup
    cleanup_old_files()

    printers = Printer.objects.filter(user=request.user)
    recent_jobs = PrintJob.objects.filter(user=request.user).order_by('-created_at')[:20]
    
    # Mark offline if not seen for more than 2 minutes
    offline_threshold = timezone.now() - timedelta(minutes=2)
    for printer in printers.filter(status='ONLINE'):
        if not printer.last_seen or printer.last_seen < offline_threshold:
            printer.status = 'OFFLINE'
            printer.save()

    active_jobs_count = PrintJob.objects.filter(user=request.user, status__in=['PENDING', 'DOWNLOADED', 'PRINTING']).count()
    online_printers_count = printers.filter(status='ONLINE', is_active=True).count()
    completed_jobs_count = PrintJob.objects.filter(user=request.user, status='COMPLETED').count()
    user_auth_token = signing.dumps({'user_id': request.user.id})

    upload_form = DocumentUploadForm()
    job_form = PrintJobCreationForm(user=request.user)

    if request.method == 'POST':
        if 'upload_file' in request.POST:
            upload_form = DocumentUploadForm(request.POST, request.FILES)
            if upload_form.is_valid():
                doc = upload_form.save(commit=False)
                doc.user = request.user
                doc.file_size = request.FILES['file'].size
                doc.original_name = request.FILES['file'].name
                doc.save()
                
                # Pre-populate job form with document id
                job_form = PrintJobCreationForm(user=request.user, initial={'document_id': doc.id})
                return render(request, 'core/dashboard.html', {
                    'printers': printers,
                    'recent_jobs': recent_jobs,
                    'upload_form': upload_form,
                    'job_form': job_form,
                    'uploaded_doc': doc,
                    'active_jobs_count': active_jobs_count,
                    'online_printers_count': online_printers_count,
                    'completed_jobs_count': completed_jobs_count,
                    'user_auth_token': user_auth_token,
                })
        
        elif 'create_job' in request.POST:
            doc_id = request.POST.get('document_id')
            doc = get_object_or_404(Document, id=doc_id, user=request.user)
            job_form = PrintJobCreationForm(request.user, request.POST)
            if job_form.is_valid():
                job = job_form.save(commit=False)
                job.user = request.user
                job.document = doc
                job.status = 'PENDING'
                job.save()
                return redirect('dashboard')

    return render(request, 'core/dashboard.html', {
        'printers': printers,
        'recent_jobs': recent_jobs,
        'upload_form': upload_form,
        'job_form': job_form,
        'active_jobs_count': active_jobs_count,
        'online_printers_count': online_printers_count,
        'completed_jobs_count': completed_jobs_count,
        'user_auth_token': user_auth_token,
    })


@login_required
def printer_toggle_view(request, printer_id):
    printer = get_object_or_404(Printer, id=printer_id, user=request.user)
    printer.is_active = not printer.is_active
    printer.save()
    return redirect('dashboard')


@login_required
def printer_delete_view(request, printer_id):
    printer = get_object_or_404(Printer, id=printer_id, user=request.user)
    printer.delete()
    return redirect('dashboard')


@login_required
def job_retry_view(request, job_id):
    job = get_object_or_404(PrintJob, id=job_id, user=request.user)
    
    # Re-upload check (if file was deleted on completion, it can't be retried unless file exists)
    if not job.document.file or not os.path.exists(job.document.file.path):
        # File is gone, retry not possible directly
        return redirect('dashboard')
        
    job.status = 'PENDING'
    job.error_message = None
    job.completed_at = None
    job.save()
    return redirect('dashboard')


@login_required
def job_cancel_view(request, job_id):
    job = get_object_or_404(PrintJob, id=job_id, user=request.user)
    if job.status in ['PENDING', 'DOWNLOADED', 'PRINTING']:
        job.status = 'CANCELLED'
        job.save()
        # Clean up file
        if job.document.file:
            try:
                if os.path.exists(job.document.file.path):
                    os.remove(job.document.file.path)
                job.document.file.name = ""
                job.document.save()
            except Exception:
                pass
    return redirect('dashboard')


@login_required
def job_delete_view(request, job_id):
    job = get_object_or_404(PrintJob, id=job_id, user=request.user)
    if job.document.file:
        try:
            if os.path.exists(job.document.file.path):
                os.remove(job.document.file.path)
        except Exception:
            pass
    doc = job.document
    job.delete()
    # Check if doc has other jobs, if not delete it
    if doc.print_jobs.count() == 0:
        doc.delete()
    return redirect('dashboard')


@login_required
def api_status_json_view(request):
    """
    Returns printer and job statuses in JSON format.
    Used for live AJAX updates on the dashboard.
    """
    printers = Printer.objects.filter(user=request.user)
    recent_jobs = PrintJob.objects.filter(user=request.user).order_by('-created_at')[:20]
    
    printer_data = [{
        'id': p.id,
        'name': p.name,
        'status': p.get_status_display(),
        'last_seen': p.last_seen.strftime('%Y-%m-%d %H:%M:%S') if p.last_seen else 'Never',
        'is_active': p.is_active
    } for p in printers]
    
    job_data = [{
        'id': j.id,
        'filename': j.document.original_name,
        'printer': j.printer.name,
        'status': j.status,
        'created_at': j.created_at.strftime('%Y-%m-%d %H:%M:%S'),
        'completed_at': j.completed_at.strftime('%Y-%m-%d %H:%M:%S') if j.completed_at else None,
        'error_message': j.error_message or ''
    } for j in recent_jobs]
    
    return JsonResponse({
        'printers': printer_data,
        'jobs': job_data
    })


# --- Desktop Agent API Views (CSRF Exempt) ---

def get_agent_user(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ')[1]
    try:
        data = signing.loads(token, max_age=86400 * 30)  # 30 days
        return User.objects.get(id=data['user_id'])
    except (signing.BadSignature, User.DoesNotExist):
        return None


def get_agent_printer(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ')[1]
    try:
        return Printer.objects.get(token=token, is_active=True)
    except Printer.DoesNotExist:
        return None


@csrf_exempt
def agent_login_api(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST request required'}, status=400)
    
    try:
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    # Allow login by email or username
    user = None
    if '@' in username:
        try:
            user_obj = User.objects.get(email=username)
            username = user_obj.username
        except User.DoesNotExist:
            pass

    user = authenticate(username=username, password=password)
    if user is not None:
        token = signing.dumps({'user_id': user.id})
        return JsonResponse({'token': token})
    else:
        return JsonResponse({'error': 'Invalid credentials'}, status=401)


@csrf_exempt
def agent_register_printers_api(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST request required'}, status=400)

    user = get_agent_user(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        data = json.loads(request.body)
        device_uuid = data.get('device_uuid')
        computer_name = data.get('computer_name', '')
        windows_username = data.get('windows_username', '')
        printers_list = data.get('printers', [])
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if not device_uuid:
        return JsonResponse({'error': 'device_uuid is required'}, status=400)

    response_printers = []
    
    # Disable printers that are not in the current list for this device
    Printer.objects.filter(user=user, device_uuid=device_uuid).exclude(name__in=printers_list).update(is_active=False)

    for printer_name in printers_list:
        printer, created = Printer.objects.get_or_create(
            user=user,
            device_uuid=device_uuid,
            name=printer_name,
            defaults={
                'computer_name': computer_name,
                'windows_username': windows_username,
                'status': 'ONLINE',
                'last_seen': timezone.now()
            }
        )
        if not created:
            printer.computer_name = computer_name
            printer.windows_username = windows_username
            printer.status = 'ONLINE'
            printer.last_seen = timezone.now()
            printer.is_active = True
            printer.save()

        response_printers.append({
            'name': printer.name,
            'token': printer.token
        })

    return JsonResponse({'printers': response_printers})


@csrf_exempt
def agent_heartbeat_api(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST request required'}, status=400)

    printer = get_agent_printer(request)
    if not printer:
        return JsonResponse({'error': 'Unauthorized or inactive printer'}, status=401)

    try:
        data = json.loads(request.body) if request.body else {}
        status = data.get('status', 'ONLINE')
        computer_name = data.get('computer_name', '')
        windows_username = data.get('windows_username', '')
    except json.JSONDecodeError:
        status = 'ONLINE'
        computer_name = ''
        windows_username = ''

    printer.status = status
    printer.last_seen = timezone.now()
    if computer_name:
        printer.computer_name = computer_name
    if windows_username:
        printer.windows_username = windows_username
    printer.save()

    return JsonResponse({'status': 'ok'})


@csrf_exempt
def agent_jobs_api(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'GET request required'}, status=400)

    printer = get_agent_printer(request)
    if not printer:
        return JsonResponse({'error': 'Unauthorized or inactive printer'}, status=401)

    # Get pending jobs for this printer
    jobs = PrintJob.objects.filter(printer=printer, status='PENDING')
    job_list = []
    for job in jobs:
        job_list.append({
            'id': job.id,
            'filename': job.document.original_name,
            'copies': job.copies,
            'paper_size': job.paper_size,
            'orientation': job.orientation,
            'color_mode': job.color_mode,
            'duplex': job.duplex,
            'page_range': job.page_range,
            'quality': job.quality,
        })

    return JsonResponse({'jobs': job_list})


@csrf_exempt
def agent_download_job_api(request, job_id):
    if request.method != 'GET':
        return JsonResponse({'error': 'GET request required'}, status=400)

    printer = get_agent_printer(request)
    if not printer:
        return JsonResponse({'error': 'Unauthorized or inactive printer'}, status=401)

    job = get_object_or_404(PrintJob, id=job_id, printer=printer)
    if not job.document.file or not os.path.exists(job.document.file.path):
        return JsonResponse({'error': 'File not found'}, status=404)

    # Set content type to PDF and return file response
    response = FileResponse(open(job.document.file.path, 'rb'), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{job.document.original_name}"'
    return response


@csrf_exempt
def agent_update_job_status_api(request, job_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST request required'}, status=400)

    printer = get_agent_printer(request)
    if not printer:
        return JsonResponse({'error': 'Unauthorized or inactive printer'}, status=401)

    job = get_object_or_404(PrintJob, id=job_id, printer=printer)

    try:
        data = json.loads(request.body)
        status = data.get('status')
        error_message = data.get('error_message')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if status not in dict(PrintJob.STATUS_CHOICES):
        return JsonResponse({'error': 'Invalid status value'}, status=400)

    job.status = status
    if error_message:
        job.error_message = error_message
    
    if status in ['COMPLETED', 'CANCELLED']:
        if status == 'COMPLETED':
            job.completed_at = timezone.now()
        # Clean up file on success or cancel immediately
        if job.document.file:
            try:
                if os.path.exists(job.document.file.path):
                    os.remove(job.document.file.path)
                job.document.file.name = ""
                job.document.save()
            except Exception:
                pass
    elif status == 'FAILED':
        job.completed_at = timezone.now()

    job.save()
    return JsonResponse({'status': 'updated'})


# --- Canvas Editor Views ---

@login_required
def canvas_editor_view(request):
    printers = Printer.objects.filter(user=request.user, is_active=True)
    user_auth_token = signing.dumps({'user_id': request.user.id})
    return render(request, 'core/canvas.html', {
        'printers': printers,
        'user_auth_token': user_auth_token
    })


@csrf_exempt
@login_required
def canvas_print_api(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=400)
    
    pdf_file = request.FILES.get('file')
    printer_id = request.POST.get('printer')
    
    if not pdf_file or not printer_id:
        return JsonResponse({'error': 'Missing file or printer selection'}, status=400)
        
    printer = get_object_or_404(Printer, id=printer_id, user=request.user)
    
    # Create Document
    doc = Document.objects.create(
        user=request.user,
        file=pdf_file,
        file_size=pdf_file.size,
        original_name="canvas_document.pdf"
    )
    
    # Extract options
    copies = int(request.POST.get('copies', 1))
    paper_size = request.POST.get('paper_size', 'A4')
    orientation = request.POST.get('orientation', 'PORTRAIT')
    color_mode = request.POST.get('color_mode', 'MONO')
    duplex = request.POST.get('duplex', 'SIMPLEX')
    quality = request.POST.get('quality', 'NORMAL')
    
    # Create PrintJob
    job = PrintJob.objects.create(
        user=request.user,
        printer=printer,
        document=doc,
        copies=copies,
        paper_size=paper_size,
        orientation=orientation,
        color_mode=color_mode,
        duplex=duplex,
        quality=quality,
        status='PENDING'
    )
    
    return JsonResponse({
        'success': True,
        'job_id': job.id,
        'redirect_url': '/'
    })
