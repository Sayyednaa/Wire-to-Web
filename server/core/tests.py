import os
import secrets
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from datetime import timedelta
from django.core import signing

from core.models import Printer, Document, PrintJob
from core.forms import UserRegistrationForm, DocumentUploadForm, PrintJobCreationForm
from core.views import cleanup_old_files

class CloudPrintModelsTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password123', email='test@example.com')

    def test_printer_creation_and_token_generation(self):
        printer = Printer.objects.create(
            user=self.user,
            name='Test HP Printer',
            device_uuid='test-uuid-1234',
            computer_name='TEST-PC',
            windows_username='testuser'
        )
        self.assertTrue(len(printer.token) > 0)
        self.assertEqual(printer.status, 'OFFLINE')
        self.assertTrue(printer.is_active)

    def test_document_creation(self):
        pdf_file = SimpleUploadedFile("test.pdf", b"%PDF-1.4...", content_type="application/pdf")
        doc = Document.objects.create(
            user=self.user,
            file=pdf_file,
            file_size=len(b"%PDF-1.4..."),
            original_name="test.pdf"
        )
        self.assertEqual(doc.original_name, "test.pdf")
        self.assertEqual(doc.file_size, 11)


class CloudPrintFormsTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password123', email='test@example.com')

    def test_registration_form_save(self):
        form_data = {
            'username': 'newuser',
            'email': 'new@example.com',
            'password': 'newpassword123',
            'name': 'Johnathan Doe'
        }
        form = UserRegistrationForm(data=form_data)
        self.assertTrue(form.is_valid())
        user = form.save()
        self.assertEqual(user.username, 'newuser')
        self.assertEqual(user.first_name, 'Johnathan')
        self.assertEqual(user.last_name, 'Doe')
        self.assertTrue(user.check_password('newpassword123'))

    def test_document_upload_form_validation(self):
        # 1. Valid PDF file
        valid_file = SimpleUploadedFile("document.pdf", b"%PDF-1.5 contents", content_type="application/pdf")
        form = DocumentUploadForm(files={'file': valid_file})
        self.assertTrue(form.is_valid())

        # 2. Invalid extension (TXT)
        invalid_ext_file = SimpleUploadedFile("document.txt", b"simple text", content_type="text/plain")
        form = DocumentUploadForm(files={'file': invalid_ext_file})
        self.assertFalse(form.is_valid())
        self.assertIn("Only PDF documents are supported in MVP.", form.errors['file'][0])

        # 3. Oversized file (simulating file size exceeding 50MB)
        large_file = SimpleUploadedFile("large.pdf", b"", content_type="application/pdf")
        large_file.size = 51 * 1024 * 1024  # 51MB
        form = DocumentUploadForm(files={'file': large_file})
        self.assertFalse(form.is_valid())
        self.assertIn("Maximum file size allowed is 50MB.", form.errors['file'][0])


class CloudPrintAPITestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='agentuser', password='agentpassword123', email='agent@example.com')
        self.printer = Printer.objects.create(
            user=self.user,
            name='Office Printer',
            device_uuid='agent-pc-uuid',
            computer_name='AGENT-PC',
            windows_username='windowsuser'
        )

    def test_agent_login_api_endpoint(self):
        # Post valid credentials
        response = self.client.post(
            '/api/agent/login/',
            data=json.dumps({'username': 'agentuser', 'password': 'agentpassword123'}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('token', data)

        # Verify token contents
        token = data['token']
        token_data = signing.loads(token)
        self.assertEqual(token_data['user_id'], self.user.id)

    def test_agent_heartbeat_api_endpoint(self):
        # Call with valid printer token
        token = self.printer.token
        response = self.client.post(
            '/api/agent/heartbeat/',
            data=json.dumps({'status': 'ONLINE', 'computer_name': 'NEW-AGENT-PC'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(response.status_code, 200)
        
        # Verify db model is updated
        self.printer.refresh_from_db()
        self.assertEqual(self.printer.status, 'ONLINE')
        self.assertEqual(self.printer.computer_name, 'NEW-AGENT-PC')
        self.assertIsNotNone(self.printer.last_seen)
import json

class CloudPrintWebViewsTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='webuser', password='webpassword123', email='web@example.com')
        self.client.login(username='webuser', password='webpassword123')

    def test_dashboard_view_loads_successfully(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'core/dashboard.html')
