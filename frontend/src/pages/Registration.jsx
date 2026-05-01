import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardBody, CardTitle } from '../components/Card';
import PageHeader from '../components/PageHeader';
import { registerPatient } from '../api/api';
import { ArrowRight, ClipboardCheck, UserPlus } from 'lucide-react';

export default function Registration() {
  const [form, setForm] = useState({ name: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    setSubmitting(true);
    try {
      const r = await registerPatient(form);
      setResult(r);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="page-enter">
        <PageHeader
          eyebrow="Step 1 of 2 complete"
          title="Patient registered"
          subtitle="The patient has been added to the network. Please direct them to the triage station to begin their visit."
        />
        <Card accent className="max-w-2xl">
          <CardBody className="py-7">
            <div className="flex items-start gap-4">
              <div className="size-12 rounded-full bg-success-50 grid place-items-center shrink-0">
                <ClipboardCheck className="size-6 text-success-600" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <div className="text-[11px] tracking-[0.16em] uppercase text-ink-700/65 font-medium mb-1">Patient ID</div>
                <div className="font-mono text-xl text-ink-900 mb-3">{result.id}</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-5">
                  <Field label="Name" value={result.name} />
                  <Field label="Phone" value={result.phone} />
                  <Field label="Triage queue position" value={`#${result.position}`} />
                  <Field label="Next station" value="Nurse triage" />
                </div>
                <div className="rounded-md bg-surface-sunken px-3.5 py-3 text-[12.5px] text-ink-700 leading-relaxed mb-5">
                  An SMS has been dispatched with the patient's queue position and estimated triage start time.
                  The patient may leave the waiting area; they will be re-notified before their turn.
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setResult(null); setForm({ name: '', phone: '' }); }}
                    className="px-4 py-2 rounded-md text-[13px] bg-surface-sunken text-ink-800 hover:bg-bone-200/70 font-medium select-none"
                  >
                    Register another patient
                  </button>
                  <button
                    onClick={() => navigate('/triage')}
                    className="px-4 py-2 rounded-md text-[13px] bg-ink-900 text-bone-50 hover:bg-ink-700 font-medium inline-flex items-center gap-1.5 select-none"
                  >
                    Go to triage
                    <ArrowRight className="size-3.5" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Front desk"
        title="Register patient"
        subtitle="Capture patient details. The patient will then be routed to nurse triage where their acuity level and journey type will be assigned."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
        <form onSubmit={onSubmit} className="lg:col-span-2">
          <Card accent>
            <CardHeader className="border-b border-bone-200">
              <div className="flex items-center gap-2">
                <UserPlus className="size-4 text-ink-700/70" strokeWidth={1.75} />
                <CardTitle>Patient details</CardTitle>
              </div>
            </CardHeader>
            <CardBody className="pt-5 space-y-5">
              <div>
                <label className="block text-[11.5px] tracking-wide uppercase text-ink-700/70 font-medium mb-1.5">Full name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={update('name')}
                  placeholder="e.g. Adaeze Okonkwo"
                  className="w-full px-3.5 py-2.5 rounded-md border border-bone-300 bg-surface-raised text-[14px] text-ink-900 placeholder:text-ink-700/40 focus:outline-none focus:border-ink-900 focus:ring-1 focus:ring-ink-900/15"
                />
              </div>
              <div>
                <label className="block text-[11.5px] tracking-wide uppercase text-ink-700/70 font-medium mb-1.5">Mobile number</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder="+234 ..."
                  className="w-full px-3.5 py-2.5 rounded-md border border-bone-300 bg-surface-raised text-[14px] text-ink-900 placeholder:text-ink-700/40 focus:outline-none focus:border-ink-900 focus:ring-1 focus:ring-ink-900/15"
                />
                <div className="text-[11.5px] text-ink-700/60 mt-1.5 leading-relaxed">
                  Used to send the patient queue updates via SMS so they can leave the premises and return when called.
                </div>
              </div>
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting || !form.name || !form.phone}
                  className="px-5 py-2.5 rounded-md text-[13.5px] bg-ink-900 text-bone-50 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink-700 inline-flex items-center gap-2 select-none"
                >
                  {submitting ? 'Registering…' : (<>Register and assign queue position <ArrowRight className="size-3.5" strokeWidth={2} /></>)}
                </button>
              </div>
            </CardBody>
          </Card>
        </form>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>What happens next</CardTitle>
            </CardHeader>
            <CardBody className="text-[12.5px] text-ink-700 leading-relaxed space-y-2.5">
              <div className="flex gap-2.5">
                <Step n="1" />
                <span>Patient gets a queue position and SMS notification.</span>
              </div>
              <div className="flex gap-2.5">
                <Step n="2" />
                <span>Nurse assigns acuity level (1–3) and journey type at triage.</span>
              </div>
              <div className="flex gap-2.5">
                <Step n="3" />
                <span>System routes the patient through the four-station network.</span>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3.5">
              <div className="text-[11px] tracking-[0.14em] uppercase text-ink-700/60 font-medium mb-1">Today</div>
              <div className="text-2xl tnum text-ink-900 font-bold">47</div>
              <div className="text-[12px] text-ink-700/70">patients registered</div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[10.5px] tracking-[0.14em] uppercase text-ink-700/60 font-medium">{label}</div>
      <div className="text-[14px] text-ink-900 font-medium mt-0.5">{value}</div>
    </div>
  );
}

function Step({ n }) {
  return (
    <span className="size-5 rounded-full bg-ink-900 text-bone-50 grid place-items-center text-[10.5px] font-mono shrink-0 mt-0.5">{n}</span>
  );
}
