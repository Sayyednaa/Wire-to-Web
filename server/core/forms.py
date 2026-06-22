from django import forms
from django.contrib.auth.models import User
from core.models import Printer, Document, PrintJob

class UserRegistrationForm(forms.ModelForm):
    name = forms.CharField(max_length=150, required=True, label="Full Name")
    email = forms.EmailField(required=True)
    password = forms.CharField(widget=forms.PasswordInput(), required=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password']

    def save(self, commit=True):
        user = super().save(commit=False)
        name_parts = self.cleaned_data['name'].split(' ', 1)
        user.first_name = name_parts[0]
        if len(name_parts) > 1:
            user.last_name = name_parts[1]
        user.set_password(self.cleaned_data['password'])
        if commit:
            user.save()
        return user


class DocumentUploadForm(forms.ModelForm):
    class Meta:
        model = Document
        fields = ['file']

    def clean_file(self):
        file = self.cleaned_data.get('file')
        if file:
            # Check extension
            if not file.name.lower().endswith('.pdf'):
                raise forms.ValidationError("Only PDF documents are supported in MVP.")
            # Check size (50MB = 50 * 1024 * 1024 bytes)
            if file.size > 50 * 1024 * 1024:
                raise forms.ValidationError("Maximum file size allowed is 50MB.")
        return file


class PrintJobCreationForm(forms.ModelForm):
    document_id = forms.IntegerField(widget=forms.HiddenInput(), required=False)

    class Meta:
        model = PrintJob
        fields = ['printer', 'copies', 'paper_size', 'orientation', 'color_mode', 'duplex', 'page_range', 'quality']

    def __init__(self, user, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Only show printers owned by the logged-in user and that are active
        self.fields['printer'].queryset = Printer.objects.filter(user=user, is_active=True)
