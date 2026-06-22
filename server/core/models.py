import secrets
from django.db import models
from django.contrib.auth.models import User

class Printer(models.Model):
    STATUS_CHOICES = [
        ('ONLINE', 'Online'),
        ('OFFLINE', 'Offline'),
        ('BUSY', 'Busy'),
        ('ERROR', 'Error'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='printers')
    name = models.CharField(max_length=255)
    device_uuid = models.CharField(max_length=255)  # Unique ID for the PC
    token = models.CharField(max_length=64, unique=True, db_index=True)
    computer_name = models.CharField(max_length=255, blank=True)
    windows_username = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='OFFLINE')
    last_seen = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('device_uuid', 'name')

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_hex(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} on {self.computer_name} ({self.user.username})"


class Document(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='documents')
    file = models.FileField(upload_to='documents/')
    file_size = models.IntegerField()  # size in bytes
    original_name = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    # Note: FileField upload_file_to is not a standard Django argument name,
    # it's upload_to. Let's fix that below.

    def __str__(self):
        return self.original_name


class PrintJob(models.Model):
    PAPER_SIZE_CHOICES = [
        ('A4', 'A4'),
        ('A3', 'A3'),
        ('LETTER', 'Letter'),
        ('LEGAL', 'Legal'),
    ]
    ORIENTATION_CHOICES = [
        ('PORTRAIT', 'Portrait'),
        ('LANDSCAPE', 'Landscape'),
    ]
    COLOR_MODE_CHOICES = [
        ('COLOR', 'Color'),
        ('MONO', 'Black & White'),
    ]
    DUPLEX_CHOICES = [
        ('SIMPLEX', 'Single Side'),
        ('DUPLEX', 'Double Side'),
    ]
    QUALITY_CHOICES = [
        ('DRAFT', 'Draft'),
        ('NORMAL', 'Normal'),
        ('HIGH', 'High'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('DOWNLOADED', 'Downloaded'),
        ('PRINTING', 'Printing'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
        ('CANCELLED', 'Cancelled'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='print_jobs')
    printer = models.ForeignKey(Printer, on_delete=models.CASCADE, related_name='print_jobs')
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='print_jobs')
    
    copies = models.IntegerField(default=1)
    paper_size = models.CharField(max_length=10, choices=PAPER_SIZE_CHOICES, default='A4')
    orientation = models.CharField(max_length=10, choices=ORIENTATION_CHOICES, default='PORTRAIT')
    color_mode = models.CharField(max_length=10, choices=COLOR_MODE_CHOICES, default='MONO')
    duplex = models.CharField(max_length=10, choices=DUPLEX_CHOICES, default='SIMPLEX')
    page_range = models.CharField(max_length=50, blank=True)  # e.g., "1-5", "2,4,6"
    quality = models.CharField(max_length=10, choices=QUALITY_CHOICES, default='NORMAL')
    
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='PENDING')
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Job #{self.id} - {self.document.original_name} on {self.printer.name} ({self.status})"
