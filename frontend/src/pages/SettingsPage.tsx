import { useState, type FormEvent } from 'react';
import { KeyRound, Palette, Pencil, Store, UserPlus, Users } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useTheme, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { digitsOnly, formatDate } from '../lib/format';
import { STORE } from '../lib/store';
import type { Role } from '../lib/types';
import { Badge, Button, Card, CardHeader, DataTable, InfoRow, Input, Modal, PageHeader, Select, cx } from '../components/ui';
import { LanguageToggle } from '../components/layout/AppLayout';

interface UserRow {
  id: number;
  name: string;
  email: string;
  mobileNumber: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function SettingsPage() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('settings.preferences')} icon={Palette} />
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">{t('common.language')}</span>
              <LanguageToggle />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">{t('common.theme')}</span>
              <div className="inline-flex rounded-lg border border-line p-0.5 text-xs font-medium">
                {(['light', 'dark'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTheme(m)}
                    aria-pressed={theme === m}
                    className={cx('rounded-md px-3 py-1.5', theme === m ? 'bg-gold-100 text-gold-800 dark:bg-gold-900/60 dark:text-gold-100' : 'text-muted')}
                  >
                    {t(`common.${m}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <ChangePassword />
        <Card>
          <CardHeader title={t('settings.store')} subtitle={t('settings.storeHint')} icon={Store} />
          <InfoRow label={t('common.name')} value={STORE.name} />
          <InfoRow label={t('common.address')} value={STORE.address || '—'} />
          <InfoRow label={t('common.mobile')} value={STORE.phone || '—'} />
          <InfoRow label={t('common.email')} value={STORE.email || '—'} />
          <InfoRow label="GSTIN" value={STORE.gstin || '—'} />
        </Card>
        {isAdmin && <UsersCard />}
      </div>
    </div>
  );
}

function ChangePassword() {
  const { t, te } = useI18n();
  const notify = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const mismatch = confirm && next !== confirm ? t('settings.passwordMismatch') : null;
  const weak = next && !PASSWORD_RE.test(next) ? t('settings.passwordHint') : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mismatch || weak) return;
    setSaving(true);
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next });
      notify(t('settings.passwordChanged'));
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t('settings.changePassword')} icon={KeyRound} />
      <form onSubmit={submit} className="space-y-3">
        <Input label={t('settings.currentPassword')} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label={t('settings.newPassword')} type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} hint={t('settings.passwordHint')} error={weak} />
        <Input label={t('settings.confirmPassword')} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch} />
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={!!mismatch || !!weak}>
            {t('common.update')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function UsersCard() {
  const { t, lang } = useI18n();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const { data, loading, reload } = useAsync(() => api.get<{ data: UserRow[] }>('/users').then((r) => r.data), []);
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={t('settings.users')}
        icon={Users}
        actions={
          <Button icon={UserPlus} size="sm" onClick={() => setEditing('new')}>
            {t('settings.addUser')}
          </Button>
        }
      />
      <DataTable
        rows={data ?? []}
        loading={loading && !data}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 'n',
            header: t('common.name'),
            render: (r) => (
              <div>
                <p className="font-medium">
                  {r.name} {r.id === me?.id && <span className="text-xs text-muted">({t('settings.you')})</span>}
                </p>
                <p className="text-xs text-muted">{r.email}</p>
              </div>
            ),
          },
          { key: 'r', header: t('settings.role'), render: (r) => <Badge tone={r.role === 'admin' ? 'gold' : 'blue'}>{t(`roles.${r.role}`)}</Badge> },
          { key: 's', header: t('common.status'), render: (r) => <Badge tone={r.isActive ? 'green' : 'slate'}>{r.isActive ? t('common.active') : t('common.inactive')}</Badge> },
          { key: 'c', header: t('common.date'), render: (r) => formatDate(r.createdAt, lang), hideSm: true },
          {
            key: 'a',
            header: '',
            align: 'right',
            render: (r) => (
              <button onClick={() => setEditing(r)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t('common.edit')}>
                <Pencil className="h-4 w-4" />
              </button>
            ),
          },
        ]}
      />
      <UserModal
        user={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </Card>
  );
}

function UserModal({ user, open, onClose, onSaved }: { user: UserRow | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t, te } = useI18n();
  const notify = useToast();
  const [f, setF] = useState({ name: '', email: '', mobile_number: '', role: 'staff' as Role, password: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const marker = open ? String(user?.id ?? 'new') : null;
  if (marker !== openedFor) {
    setOpenedFor(marker);
    if (open)
      setF({
        name: user?.name ?? '',
        email: user?.email ?? '',
        mobile_number: user?.mobileNumber ?? '',
        role: user?.role ?? 'staff',
        password: '',
        is_active: user?.isActive ?? true,
      });
  }
  const weak = f.password && !PASSWORD_RE.test(f.password) ? t('settings.passwordHint') : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (weak || (!user && !f.password)) return;
    setSaving(true);
    try {
      if (user) {
        await api.patch(`/users/${user.id}`, {
          name: f.name,
          mobile_number: f.mobile_number || null,
          role: f.role,
          is_active: f.is_active,
          ...(f.password && { password: f.password }),
        });
      } else {
        await api.post('/users', { name: f.name, email: f.email, mobile_number: f.mobile_number || null, role: f.role, password: f.password });
      }
      notify(t('settings.userSaved'));
      onSaved();
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? t('settings.editUser') : t('settings.addUser')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="user-form" loading={saving} disabled={!!weak}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Input label={t('common.name')} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} wrapClassName="sm:col-span-2" />
        <Input label={t('common.email')} type="email" required disabled={!!user} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input label={t('common.mobile')} inputMode="numeric" value={f.mobile_number} onChange={(e) => setF({ ...f, mobile_number: digitsOnly(e.target.value) })} />
        <Select
          label={t('settings.role')}
          value={f.role}
          onChange={(e) => setF({ ...f, role: e.target.value as Role })}
          options={(['staff', 'admin'] as const).map((r) => ({ value: r, label: t(`roles.${r}`) }))}
        />
        <Input
          label={user ? t('settings.resetPassword') : t('settings.password')}
          type="password"
          autoComplete="new-password"
          required={!user}
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
          error={weak}
          hint={t('settings.passwordHint')}
        />
        {user && (
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} className="h-4 w-4 accent-gold-600" />
            {t('common.active')}
          </label>
        )}
      </form>
    </Modal>
  );
}
