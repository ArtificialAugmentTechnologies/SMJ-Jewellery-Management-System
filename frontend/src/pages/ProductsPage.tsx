import { useState, type FormEvent } from 'react';
import { Info, Pencil, Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { formatDateTime, formatMoney, num } from '../lib/format';
import { CATEGORIES, METALS, type Category, type Metal, type Movement, type Product } from '../lib/types';
import { Alert, Badge, Button, Card, DataTable, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import { MovementBadge } from '../components/badges';

export default function ProductsPage() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const debounced = useDebounced(search);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [viewing, setViewing] = useState<Product | null>(null);
  const { data, loading, reload } = useAsync(
    () => api.get<{ data: Product[] }>('/products', { search: debounced, category }).then((r) => r.data),
    [debounced, category],
  );

  return (
    <div>
      <PageHeader
        title={t('products.title')}
        subtitle={t('products.subtitle')}
        actions={
          isAdmin && (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              {t('products.add')}
            </Button>
          )
        }
      />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Input placeholder={t('products.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} wrapClassName="w-full sm:w-72" aria-label={t('common.search')} />
          <Select
            aria-label={t('items.category')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t('products.allCategories')}
            options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
            wrapClassName="w-full sm:w-52"
          />
        </div>
        <DataTable
          rows={data ?? []}
          loading={loading && !data}
          rowKey={(r) => r.id}
          onRowClick={setViewing}
          empty={t('common.noData')}
          columns={[
            {
              key: 'n',
              header: t('items.productName'),
              render: (r) => (
                <div>
                  <p className="font-medium">{r.productName}</p>
                  {r.description && <p className="max-w-xs truncate text-xs text-muted">{r.description}</p>}
                </div>
              ),
            },
            { key: 'c', header: t('items.category'), render: (r) => t(`categories.${r.category}`) },
            { key: 'm', header: t('items.metal'), render: (r) => <Badge tone={r.metal === 'gold' ? 'gold' : 'slate'}>{t(`metals.${r.metal}`)}</Badge>, hideSm: true },
            { key: 'w', header: t('items.weightPerPiece'), align: 'right', render: (r) => num(r.weight).toFixed(3) },
            {
              key: 'q',
              header: t('products.inStock'),
              align: 'right',
              render: (r) =>
                r.quantity === 0 ? (
                  <Badge tone="red">{t('products.outOfStock')}</Badge>
                ) : (
                  <span className={r.quantity <= 3 ? 'font-semibold text-amber-600' : 'font-semibold'}>{r.quantity}</span>
                ),
            },
            { key: 'p', header: t('products.purchasePrice'), align: 'right', render: (r) => formatMoney(r.purchasePrice), hideSm: true },
            ...(isAdmin
              ? [
                  {
                    key: 'a',
                    header: '',
                    align: 'right' as const,
                    render: (r: Product) => (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(r);
                        }}
                        className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
                        aria-label={t('common.edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <ProductFormModal
        product={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ProductMovementsModal product={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function ProductFormModal({ product, open, onClose, onSaved }: { product: Product | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t, te } = useI18n();
  const notify = useToast();
  const blank = { product_name: '', category: 'Ring' as Category, metal: 'gold' as Metal, description: '', weight: '', purchase_price: '0' };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const marker = open ? String(product?.id ?? 'new') : null;
  if (marker !== openedFor) {
    setOpenedFor(marker);
    if (open)
      setForm(
        product
          ? {
              product_name: product.productName,
              category: product.category,
              metal: product.metal,
              description: product.description ?? '',
              weight: String(num(product.weight)),
              purchase_price: String(num(product.purchasePrice)),
            }
          : blank,
      );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, description: form.description || null, weight: form.weight || '0', purchase_price: form.purchase_price || '0' };
      if (product) await api.patch(`/products/${product.id}`, body);
      else await api.post('/products', body);
      notify(t('products.saved'));
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
      title={product ? t('products.edit') : t('products.add')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="product-form" loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Input label={t('items.productName')} required value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} maxLength={150} wrapClassName="sm:col-span-2" />
        <Select
          label={t('items.category')}
          required
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
          options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
        />
        <Select
          label={t('items.metal')}
          value={form.metal}
          onChange={(e) => setForm({ ...form, metal: e.target.value as Metal })}
          options={METALS.map((m) => ({ value: m, label: t(`metals.${m}`) }))}
        />
        <Input label={t('items.weightPerPiece')} type="number" min="0" step="0.001" required value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
        <Input label={t('products.purchasePrice')} type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
        <Textarea label={t('items.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} wrapClassName="sm:col-span-2" />
        <div className="sm:col-span-2">
          <Alert icon={Info}>{t('products.stockNote')}</Alert>
        </div>
      </form>
    </Modal>
  );
}

function ProductMovementsModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { data, loading } = useAsync(
    () =>
      product
        ? api.get<{ data: Product & { movements: (Movement & { movementType: Movement['movement_type']; movementDate: string; partyName: string | null; createdByName: string | null })[] } }>(`/products/${product.id}`).then((r) => r.data)
        : Promise.resolve(null),
    [product?.id],
  );
  return (
    <Modal open={!!product} onClose={onClose} title={product?.productName ?? ''} size="xl">
      {loading || !data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <Badge tone="gold">{t(`categories.${data.category}`)}</Badge>
            <Badge>{t(`metals.${data.metal}`)}</Badge>
            <Badge tone="green">
              {t('products.inStock')}: {data.quantity}
            </Badge>
          </div>
          <h3 className="mb-2 text-sm font-semibold text-ink">{t('products.movements')}</h3>
          <DataTable
            rows={data.movements}
            rowKey={(r) => r.id}
            empty={t('common.noData')}
            columns={[
              { key: 'd', header: t('common.date'), render: (r) => formatDateTime(r.movementDate, lang) },
              { key: 't', header: t('stock.movementType'), render: (r) => <MovementBadge type={r.movementType} /> },
              { key: 'q', header: t('items.quantity'), align: 'right', render: (r) => r.quantity },
              { key: 'w', header: t('invoice.weight'), align: 'right', render: (r) => num(r.weight).toFixed(3) },
              { key: 'p', header: t('stock.party'), render: (r) => r.partyName ?? '—', hideSm: true },
              { key: 'u', header: t('stock.recordedBy'), render: (r) => r.createdByName ?? '—', hideSm: true },
              { key: 'r', header: t('common.remarks'), render: (r) => <span className="text-muted">{r.remarks}</span>, hideSm: true },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
