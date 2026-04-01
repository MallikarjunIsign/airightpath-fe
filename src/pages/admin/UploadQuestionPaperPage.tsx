import { useState } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileUpload } from '@/components/ui/FileUpload';
import { useToast } from '@/components/ui/Toast';
import { assessmentService } from '@/services/assessment.service';

export function UploadQuestionPaperPage() {
  const { showToast } = useToast();

  const [assessmentType, setAssessmentType] = useState<'APTITUDE' | 'CODING'>('APTITUDE');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (files.length === 0) {
      showToast('Please select a question paper file to upload', 'warning');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', files[0]);
      formData.append('assessmentType', assessmentType);

      await assessmentService.upload(formData);
      showToast('Question paper uploaded successfully!', 'success');
      setFiles([]);
    } catch {
      // Error toast auto-handled by interceptor
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">Upload Question Paper</h1>
        <p className="text-[var(--textSecondary)] mt-1">
          Upload assessment question papers for aptitude or coding tests
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileUp size={20} className="text-[var(--primary)]" />
            <CardTitle>Question Paper Upload</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Assessment Type Selector */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-3">
                Assessment Type
              </label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setAssessmentType('APTITUDE')}
                  className={`
                    flex-1 py-3 px-4 rounded-lg border-2 text-center transition-all duration-200
                    ${assessmentType === 'APTITUDE'
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:border-[var(--borderHover)] text-[var(--textSecondary)]'
                    }
                  `}
                >
                  <p className="font-semibold text-sm">Aptitude</p>
                  <p className="text-xs mt-1 opacity-70">
                    MCQ-based assessment
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setAssessmentType('CODING')}
                  className={`
                    flex-1 py-3 px-4 rounded-lg border-2 text-center transition-all duration-200
                    ${assessmentType === 'CODING'
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:border-[var(--borderHover)] text-[var(--textSecondary)]'
                    }
                  `}
                >
                  <p className="font-semibold text-sm">Coding</p>
                  <p className="text-xs mt-1 opacity-70">
                    Programming challenges
                  </p>
                </button>
              </div>
            </div>

            {/* File Upload */}
            <FileUpload
              label="Question Paper File"
              accept=".pdf,.doc,.docx,.json,.xlsx,.xls,.csv"
              maxSizeBytes={10 * 1024 * 1024}
              onChange={(newFiles) => setFiles(newFiles)}
              onError={(msg) => showToast(msg, 'error')}
              helperText="Supported formats: PDF, DOC, DOCX, JSON, Excel, CSV (max 10MB)"
            />

            {/* Upload Button */}
            <Button
              onClick={handleUpload}
              isLoading={uploading}
              leftIcon={!uploading ? <Upload size={16} /> : undefined}
              className="w-full"
            >
              Upload Question Paper
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
