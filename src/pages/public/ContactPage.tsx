import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, CheckCircle, Send } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const contactInfo = [
    { icon: <Mail size={20} />, label: 'Email', value: 'support@airightpath.com' },
    { icon: <Phone size={20} />, label: 'Phone', value: '+91-XXXXXXXXXX' },
    { icon: <MapPin size={20} />, label: 'Location', value: 'Hyderabad, India' },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="fixed top-0 left-0 right-0 h-16 bg-[var(--navbarBg)]/80 backdrop-blur-md border-b border-[var(--navbarBorder)] z-30">
        <div className="h-full px-6 flex items-center justify-between max-w-7xl mx-auto">
          <Link to={ROUTES.PUBLIC.HOME} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm gradient-brand shadow-sm">RP</div>
            <span className="font-bold text-lg font-heading gradient-text">RightPath</span>
          </Link>
        </div>
      </header>

      <main className="pt-24 pb-16 px-6 max-w-5xl mx-auto animate-fade-in-up">
        <Link to={ROUTES.PUBLIC.HOME} className="inline-flex items-center gap-2 text-sm text-[var(--textSecondary)] hover:text-[var(--text)] mb-8 transition-colors">
          <ArrowLeft size={16} /> Back to Home
        </Link>

        <h1 className="text-4xl font-bold text-[var(--text)] mb-3 font-heading">Contact Us</h1>
        <p className="text-[var(--textSecondary)] mb-10">Have a question? We'd love to hear from you.</p>

        <div className="grid md:grid-cols-5 gap-10">
          {/* Left - Contact Info */}
          <div className="md:col-span-2">
            <h2 className="text-xl font-semibold text-[var(--text)] mb-6 font-heading">Get in Touch</h2>
            <div className="space-y-5">
              {contactInfo.map((item) => (
                <div key={item.label} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--primaryLight)] flex items-center justify-center flex-shrink-0">
                    <span className="text-[var(--primary)]">{item.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{item.label}</p>
                    <p className="text-sm text-[var(--textSecondary)]">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Form */}
          <div className="md:col-span-3">
            <div className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-xl p-8 shadow-card">
              {submitted ? (
                <div className="text-center py-8 animate-fade-in-up">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--successLight)] flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="text-[var(--success)]" size={28} />
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--text)] mb-2 font-heading">Message Sent!</h3>
                  <p className="text-[var(--textSecondary)]">We'll get back to you soon.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <Input label="Name" placeholder="Your name" required />
                  <Input label="Email" type="email" placeholder="you@example.com" required />
                  <div>
                    <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Message</label>
                    <textarea
                      rows={4}
                      placeholder="How can we help?"
                      required
                      className="w-full px-4 py-2.5 rounded-[10px] bg-[var(--inputBg)] border border-[var(--inputBorder)] text-[var(--text)] placeholder:text-[var(--textTertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--inputFocus)]/20 focus:border-[var(--inputFocus)] resize-none transition-all duration-200"
                    />
                  </div>
                  <Button type="submit" variant="primary" className="w-full" rightIcon={<Send size={16} />}>
                    Send Message
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
