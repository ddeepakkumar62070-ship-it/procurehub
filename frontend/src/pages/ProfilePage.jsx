import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const emptyForm = {
  firstName: '',
  lastName: '',
  phone: '',
  businessName: '',
  registrationNumber: '',
  taxId: '',
  address: '',
  city: '',
  state: '',
  country: '',
  preferredCurrency: '',
  leadTimeDays: '',
};

function ProfilePage() {
  const profile = useAuthStore((state) => state.profile);
  const loadProfile = useAuthStore((state) => state.loadProfile);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProfile().catch((requestError) => {
      setError(requestError.response?.data?.error?.message || 'Could not load your profile');
    });
  }, [loadProfile]);

  useEffect(() => {
    if (!profile) return;
    setForm({
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phone: profile.phone || '',
      businessName: profile.business?.name || '',
      registrationNumber: profile.business?.registrationNumber || '',
      taxId: profile.business?.taxId || '',
      address: profile.business?.address || '',
      city: profile.business?.city || '',
      state: profile.business?.state || '',
      country: profile.business?.country || '',
      preferredCurrency: profile.buyerProfile?.preferredCurrency || 'USD',
      leadTimeDays: profile.supplierProfile?.leadTimeDays ?? '',
    });
  }, [profile]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSaving(true);
    const changes = { ...form };
    if (profile.roles.includes('SUPPLIER')) {
      changes.leadTimeDays = Number(changes.leadTimeDays || 0);
    } else {
      delete changes.leadTimeDays;
    }
    if (profile.roles.includes('BUYER')) {
      changes.preferredCurrency = changes.preferredCurrency.toUpperCase();
    } else {
      delete changes.preferredCurrency;
    }
    for (const key of Object.keys(changes)) {
      if (changes[key] === '') changes[key] = null;
    }

    try {
      await updateProfile(changes);
      setMessage('Profile saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not save your profile');
    } finally {
      setIsSaving(false);
    }
  }

  const isBuyer = profile?.roles.includes('BUYER');
  const isSupplier = profile?.roles.includes('SUPPLIER');
  const canEditBusinessProfile = isBuyer || isSupplier;

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <Link to="/dashboard">Back to dashboard</Link>
      </header>
      <section className="dashboard-card profile-card">
        <p className="eyebrow">Account settings</p>
        <h1>Business profile</h1>
        {profile && (
          <>
            <p className="muted">{profile.email} · {profile.roles.join(', ')}</p>
            {isSupplier && (
              <p className="status-note">
                Supplier verification: {profile.supplierProfile.verificationStatus}
              </p>
            )}
            {canEditBusinessProfile ? (
              <form className="form-stack profile-form" onSubmit={handleSubmit}>
                <div className="form-grid">
                  <label>First name<input name="firstName" value={form.firstName} onChange={updateField} required /></label>
                  <label>Last name<input name="lastName" value={form.lastName} onChange={updateField} required /></label>
                </div>
                <label>Phone<input name="phone" value={form.phone} onChange={updateField} /></label>
                <label>Business name<input name="businessName" value={form.businessName} onChange={updateField} required /></label>
                <div className="form-grid">
                  <label>Registration number<input name="registrationNumber" value={form.registrationNumber} onChange={updateField} /></label>
                  <label>Tax ID<input name="taxId" value={form.taxId} onChange={updateField} /></label>
                </div>
                <label>Address<input name="address" value={form.address} onChange={updateField} /></label>
                <div className="form-grid">
                  <label>City<input name="city" value={form.city} onChange={updateField} /></label>
                  <label>State / region<input name="state" value={form.state} onChange={updateField} /></label>
                  <label>Country<input name="country" value={form.country} onChange={updateField} /></label>
                </div>
                {isBuyer && (
                  <label>Preferred currency
                    <input name="preferredCurrency" value={form.preferredCurrency} onChange={updateField} required minLength={3} maxLength={3} />
                  </label>
                )}
                {isSupplier && (
                  <label>Typical lead time (days)
                    <input name="leadTimeDays" type="number" min="0" max="3650" value={form.leadTimeDays} onChange={updateField} />
                  </label>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                {message && <p className="success-message" role="status">{message}</p>}
                <button className="primary-button" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save profile'}
                </button>
              </form>
            ) : (
              <p className="dashboard-note">Administrator accounts do not have a buyer or supplier business profile.</p>
            )}
          </>
        )}
        {!profile && !error && <p className="muted">Loading profile…</p>}
      </section>
    </main>
  );
}

export default ProfilePage;
