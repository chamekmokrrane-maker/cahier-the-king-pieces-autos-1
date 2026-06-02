import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Check,
  ClipboardList,
  Edit3,
  Eye,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageCircle,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Shield,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import logo from './assets/logo.png';
import dashboardHero from './assets/dashboard-hero.jpeg';
import {
  createNoPersistSupabaseClient,
  isSupabaseConfigured,
  supabase,
  usernameToEmail,
  cleanUsername,
} from './lib/supabase';
import './styles.css';

const ENTREPRISE = {
  nom: 'THE KING PIECES AUTOS',
  adresse: '32 avenue Marcel Cachin, 93240 Stains',
  telephone: '0184741500',
  whatsapp: '+33650058945',
  email: 'thekingpiecesautos@gmail.com',
  tva: 'FR80977631530',
};

const TVA_RATE = 0.2;
const LOCAL_KEY = 'tkpa_cahier_local_data_v1';
const EMPTY_DATA = { demandes: [], devis: [], factures: [], profiles: [] };

function uid(prefix = 'id') {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleDateString('fr-FR'); } catch { return value; }
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function normalisePhone(phone) {
  const raw = String(phone || '').replace(/[^0-9+]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+')) return raw.replace('+', '');
  if (raw.startsWith('0')) return `33${raw.slice(1)}`;
  return raw;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readLocalData() {
  try { return { ...EMPTY_DATA, ...(JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')) }; }
  catch { return EMPTY_DATA; }
}

function writeLocalData(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...EMPTY_DATA, ...data }));
}

function generateLocalNumero(kind, list) {
  const year = new Date().getFullYear();
  const max = (list || [])
    .map((item) => String(item.numero || ''))
    .filter((n) => n.startsWith(`${kind}-${year}-`))
    .map((n) => Number(n.split('-').pop()))
    .filter(Boolean)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${kind}-${year}-${String(max + 1).padStart(4, '0')}`;
}

async function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function createPiece() {
  return { id: uid('piece'), designation: '', reference: '', quantite: 1, prix_ttc: '', disponibilite: '', photo: '' };
}

function createProposition(index = 1) {
  return { id: uid('prop'), titre: `Proposition ${index}`, pieces: [createPiece()] };
}

function createEmptyDemande() {
  return {
    id: '', numero: '', origine: 'Téléphone', statut: 'Traité',
    client_nom: '', client_tel: '', plaque: '', marque: '', modele: '', vin: '', salarie_nom: '', notes: '',
    propositions: [createProposition(1)], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

function cleanDemande(raw) {
  const base = { ...createEmptyDemande(), ...(raw || {}) };
  const propositions = Array.isArray(base.propositions) && base.propositions.length ? base.propositions : [createProposition(1)];
  return {
    ...base,
    propositions: propositions.map((prop, pIndex) => ({
      id: prop.id || uid('prop'),
      titre: prop.titre || `Proposition ${pIndex + 1}`,
      pieces: Array.isArray(prop.pieces) && prop.pieces.length
        ? prop.pieces.map((piece) => ({ ...createPiece(), ...piece, id: piece.id || uid('piece') }))
        : [createPiece()],
    })),
  };
}

function createDevisLine() {
  return { ...createPiece(), proposition_titre: '' };
}

function createEmptyDevis() {
  return {
    id: '', numero: '', demande_id: null, statut: 'Brouillon',
    client_nom: '', client_tel: '', plaque: '', marque: '', modele: '', vin: '', salarie_nom: '',
    lignes: [createDevisLine()], totals: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

function createFactureLine() {
  return { id: uid('fac-line'), description: '', quantite: 1, prix_ht: '', tva: 20 };
}

function createEmptyFacture() {
  return {
    id: '', numero: '', date_facture: todayIso(), date_echeance: todayIso(),
    client_nom: '', client_adresse: '', client_cp_ville: '',
    mode_reglement: 'Virement', paye_le: todayIso(), statut: 'Payée', notes: '',
    lignes: [createFactureLine()], totals: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

function totalPiece(piece) {
  return Number(piece.quantite || 0) * Number(piece.prix_ttc || 0);
}

function totalProposition(prop) {
  return (prop.pieces || []).reduce((sum, piece) => sum + totalPiece(piece), 0);
}

function totalDemande(demande) {
  return (demande.propositions || []).reduce((sum, prop) => sum + totalProposition(prop), 0);
}

function totalsFromLines(lines) {
  const totalTtc = (lines || []).reduce((sum, line) => sum + totalPiece(line), 0);
  const totalHt = totalTtc / (1 + TVA_RATE);
  const tva = totalTtc - totalHt;
  return { total_ht: totalHt, tva, total_ttc: totalTtc };
}

function totalFactureLine(line) {
  const ht = Number(line.quantite || 0) * Number(line.prix_ht || 0);
  const tva = ht * (Number(line.tva || 0) / 100);
  return { ht, tva, ttc: ht + tva };
}

function totalsFromFacture(lines) {
  return (lines || []).reduce((acc, line) => {
    const t = totalFactureLine(line);
    acc.total_ht += t.ht;
    acc.tva += t.tva;
    acc.total_ttc += t.ttc;
    return acc;
  }, { total_ht: 0, tva: 0, total_ttc: 0 });
}

function hasMeaningfulDemande(d) {
  return Boolean(
    d.client_nom || d.client_tel || d.plaque || d.marque || d.modele || d.vin || d.salarie_nom ||
    (d.propositions || []).some((p) => (p.pieces || []).some((piece) => piece.designation || piece.reference || piece.prix_ttc))
  );
}

function classNames(...items) {
  return items.filter(Boolean).join(' ');
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [demandes, setDemandes] = useState([]);
  const [devis, setDevis] = useState([]);
  const [factures, setFactures] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [selectedDevis, setSelectedDevis] = useState(null);
  const [selectedFacture, setSelectedFacture] = useState(null);
  const [message, setMessage] = useState('');
  const [offlineMode, setOfflineMode] = useState(!isSupabaseConfigured);

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!isSupabaseConfigured || !supabase) {
        const local = readLocalData();
        if (!mounted) return;
        setDemandes(local.demandes || []);
        setDevis(local.devis || []);
        setFactures(local.factures || []);
        setProfiles(local.profiles || []);
        setOfflineMode(true);
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session || null);
      setLoading(false);
    }
    init();
    if (isSupabaseConfigured && supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
      return () => authListener.subscription.unsubscribe();
    }
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (offlineMode) return;
    if (session?.user) loadAll();
    else {
      setProfile(null); setDemandes([]); setDevis([]); setFactures([]); setProfiles([]);
    }
  }, [session?.user?.id, offlineMode]);

  async function loadAll() {
    if (!supabase || !session?.user) return;
    setLoading(true);
    try {
      const [profileRes, demandesRes, devisRes, profilesRes, facturesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('demandes').select('*').order('updated_at', { ascending: false }),
        supabase.from('devis').select('*').order('updated_at', { ascending: false }),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('factures').select('*').order('updated_at', { ascending: false }),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (demandesRes.error) throw demandesRes.error;
      if (devisRes.error) throw devisRes.error;
      if (profilesRes.error) throw profilesRes.error;

      setProfile(profileRes.data || null);
      setDemandes((demandesRes.data || []).map(cleanDemande));
      setDevis(devisRes.data || []);
      setProfiles(profilesRes.data || []);
      if (facturesRes.error) {
        setFactures([]);
        setMessage('Pour activer les factures clients, colle le nouveau SQL dans Supabase.');
      } else {
        setFactures(facturesRes.data || []);
      }
    } catch (error) {
      setMessage(`Erreur chargement : ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function nextNumero(kind) {
    if (!offlineMode && supabase) {
      const { data, error } = await supabase.rpc('next_counter', { prefix: kind });
      if (error) throw error;
      return data;
    }
    const local = readLocalData();
    return generateLocalNumero(kind, kind === 'DEV' ? local.devis : local.demandes);
  }

  async function saveDemande(demande, silent = false) {
    const clean = cleanDemande({ ...demande, updated_at: new Date().toISOString() });
    if (!hasMeaningfulDemande(clean)) return clean;
    try {
      if (!clean.id) clean.id = uid('demande');
      if (!clean.numero) clean.numero = await nextNumero('DEM');
      if (offlineMode) {
        const local = readLocalData();
        const list = [clean, ...(local.demandes || []).filter((d) => d.id !== clean.id)];
        writeLocalData({ ...local, demandes: list });
        setDemandes(list);
      } else {
        const payload = {
          id: clean.id, numero: clean.numero, origine: clean.origine, statut: clean.statut,
          client_nom: clean.client_nom, client_tel: clean.client_tel, plaque: clean.plaque,
          marque: clean.marque, modele: clean.modele, vin: clean.vin, salarie_nom: clean.salarie_nom,
          notes: clean.notes, propositions: clean.propositions, updated_at: clean.updated_at,
        };
        const { data, error } = await supabase.from('demandes').upsert(payload).select('*').single();
        if (error) throw error;
        const saved = cleanDemande(data);
        setDemandes((items) => [saved, ...items.filter((d) => d.id !== saved.id)]);
        if (!silent) setMessage('Demande enregistrée.');
        return saved;
      }
      if (!silent) setMessage('Demande enregistrée.');
      return clean;
    } catch (error) {
      setMessage(`Erreur sauvegarde demande : ${error.message}`);
      throw error;
    }
  }

  async function deleteDemande(id) {
    if (!window.confirm('Supprimer cette demande ?')) return;
    try {
      if (offlineMode) {
        const local = readLocalData();
        const list = (local.demandes || []).filter((d) => d.id !== id);
        writeLocalData({ ...local, demandes: list });
        setDemandes(list);
      } else {
        const { error } = await supabase.from('demandes').delete().eq('id', id);
        if (error) throw error;
        setDemandes((items) => items.filter((d) => d.id !== id));
      }
      setSelectedDemande(null);
      setPage('demandes');
      setMessage('Demande supprimée.');
    } catch (error) { setMessage(`Erreur suppression : ${error.message}`); }
  }

  async function saveDevis(devisData, silent = false) {
    const clean = {
      ...devisData,
      lignes: Array.isArray(devisData.lignes) && devisData.lignes.length ? devisData.lignes : [createDevisLine()],
      updated_at: new Date().toISOString(),
    };
    if (!clean.id) clean.id = uid('devis');
    if (!clean.numero) clean.numero = await nextNumero('DEV');
    clean.totals = totalsFromLines(clean.lignes);
    try {
      if (offlineMode) {
        const local = readLocalData();
        const list = [clean, ...(local.devis || []).filter((d) => d.id !== clean.id)];
        writeLocalData({ ...local, devis: list });
        setDevis(list);
      } else {
        const payload = {
          id: clean.id, numero: clean.numero, demande_id: clean.demande_id || null,
          client_nom: clean.client_nom, client_tel: clean.client_tel, plaque: clean.plaque,
          marque: clean.marque, modele: clean.modele, vin: clean.vin, salarie_nom: clean.salarie_nom,
          statut: clean.statut || 'Brouillon', lignes: clean.lignes, totals: clean.totals, updated_at: clean.updated_at,
        };
        const { data, error } = await supabase.from('devis').upsert(payload).select('*').single();
        if (error) throw error;
        setDevis((items) => [data, ...items.filter((d) => d.id !== data.id)]);
        if (!silent) setMessage('Devis enregistré.');
        return data;
      }
      if (!silent) setMessage('Devis enregistré.');
      return clean;
    } catch (error) {
      setMessage(`Erreur sauvegarde devis : ${error.message}`);
      throw error;
    }
  }

  async function deleteDevis(id) {
    if (!window.confirm('Supprimer ce devis ?')) return;
    try {
      if (offlineMode) {
        const local = readLocalData();
        const list = (local.devis || []).filter((d) => d.id !== id);
        writeLocalData({ ...local, devis: list });
        setDevis(list);
      } else {
        const { error } = await supabase.from('devis').delete().eq('id', id);
        if (error) throw error;
        setDevis((items) => items.filter((d) => d.id !== id));
      }
      setSelectedDevis(null);
      setPage('devis');
      setMessage('Devis supprimé.');
    } catch (error) { setMessage(`Erreur suppression devis : ${error.message}`); }
  }

  async function saveFacture(facture, silent = false) {
    const clean = {
      ...facture,
      lignes: Array.isArray(facture.lignes) && facture.lignes.length ? facture.lignes : [createFactureLine()],
      updated_at: new Date().toISOString(),
    };
    if (!clean.id) clean.id = uid('facture');
    clean.totals = totalsFromFacture(clean.lignes);
    try {
      if (offlineMode) {
        const local = readLocalData();
        const list = [clean, ...(local.factures || []).filter((f) => f.id !== clean.id)];
        writeLocalData({ ...local, factures: list });
        setFactures(list);
      } else {
        const payload = {
          id: clean.id, numero: clean.numero, date_facture: clean.date_facture, date_echeance: clean.date_echeance,
          client_nom: clean.client_nom, client_adresse: clean.client_adresse, client_cp_ville: clean.client_cp_ville,
          mode_reglement: clean.mode_reglement, paye_le: clean.paye_le || null, statut: clean.statut || 'Brouillon',
          notes: clean.notes, lignes: clean.lignes, totals: clean.totals, updated_at: clean.updated_at,
        };
        const { data, error } = await supabase.from('factures').upsert(payload).select('*').single();
        if (error) throw error;
        setFactures((items) => [data, ...items.filter((f) => f.id !== data.id)]);
        if (!silent) setMessage('Facture enregistrée.');
        return data;
      }
      if (!silent) setMessage('Facture enregistrée.');
      return clean;
    } catch (error) {
      setMessage(`Erreur sauvegarde facture : ${error.message}`);
      throw error;
    }
  }

  async function deleteFacture(id) {
    if (!window.confirm('Supprimer cette facture ?')) return;
    try {
      if (offlineMode) {
        const local = readLocalData();
        const list = (local.factures || []).filter((f) => f.id !== id);
        writeLocalData({ ...local, factures: list });
        setFactures(list);
      } else {
        const { error } = await supabase.from('factures').delete().eq('id', id);
        if (error) throw error;
        setFactures((items) => items.filter((f) => f.id !== id));
      }
      setSelectedFacture(null);
      setPage('factures');
      setMessage('Facture supprimée.');
    } catch (error) { setMessage(`Erreur suppression facture : ${error.message}`); }
  }

  async function transformDemandeToDevis(demande, propositionId = null) {
    const clean = cleanDemande(demande);
    const propositions = propositionId ? clean.propositions.filter((p) => p.id === propositionId) : clean.propositions;
    const lignes = propositions.flatMap((prop) =>
      (prop.pieces || [])
        .filter((piece) => piece.designation || piece.reference || piece.prix_ttc)
        .map((piece) => ({ ...piece, proposition_titre: prop.titre }))
    );
    const saved = await saveDevis({
      ...createEmptyDevis(), id: '', numero: '', demande_id: clean.id || null,
      client_nom: clean.client_nom, client_tel: clean.client_tel, plaque: clean.plaque,
      marque: clean.marque, modele: clean.modele, vin: clean.vin, salarie_nom: clean.salarie_nom,
      lignes: lignes.length ? lignes : [createDevisLine()],
    });
    await saveDemande({ ...clean, statut: 'Envoyé en devis' }, true);
    setSelectedDevis(saved);
    setPage('devis-edit');
  }

  async function resumeDemande(demande) {
    const saved = await saveDemande({ ...cleanDemande(demande), statut: 'Traité' }, true);
    setSelectedDemande(saved);
    setPage('demande-edit');
    setMessage('Dossier repris pour traitement.');
  }

  function transformDevisToFacture(devisData) {
    const totals = devisData.totals || totalsFromLines(devisData.lignes || []);
    const facture = {
      ...createEmptyFacture(),
      id: '',
      numero: '',
      date_facture: todayIso(),
      date_echeance: todayIso(),
      client_nom: devisData.client_nom || '',
      client_adresse: '',
      client_cp_ville: '',
      mode_reglement: '',
      paye_le: '',
      statut: 'Brouillon',
      notes: `Facture créée depuis le devis ${devisData.numero || ''}`.trim(),
      lignes: (devisData.lignes || []).length
        ? devisData.lignes.map((line) => ({
            id: uid('fac-line'),
            description: line.designation || '',
            quantite: line.quantite || 1,
            prix_ht: (Number(line.prix_ttc || 0) / (1 + TVA_RATE)).toFixed(2),
            tva: 20,
          }))
        : [createFactureLine()],
      totals,
    };
    setSelectedFacture(facture);
    setPage('facture-edit');
  }

  async function signOut() {
    if (offlineMode) { setSession(null); setProfile(null); return; }
    await supabase.auth.signOut();
  }

  const stats = useMemo(() => ({
    attente: demandes.filter((d) => d.statut === 'En attente').length,
    demandes: demandes.length,
    devis: devis.length,
    factures: factures.length,
    totalDevis: devis.reduce((sum, d) => sum + Number(d.totals?.total_ttc || totalsFromLines(d.lignes).total_ttc), 0),
  }), [demandes, devis, factures]);

  if (loading) return <Splash />;
  if (!offlineMode && !session) return <LoginPage onMessage={setMessage} message={message} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <img src={logo} alt="THE KING PIECES AUTOS" />
          <div><strong>TKPA</strong><span>Cahier professionnel</span></div>
        </div>
        <nav className="nav-list">
          <NavButton icon={<LayoutDashboard />} label="Accueil" active={page === 'dashboard'} onClick={() => setPage('dashboard')} />
          <NavButton icon={<Plus />} label="Nouvelle demande" active={page === 'demande-edit' && !selectedDemande?.id} onClick={() => { setSelectedDemande(createEmptyDemande()); setPage('demande-edit'); }} />
          <NavButton icon={<ClipboardList />} label="En attente" active={page === 'attente'} onClick={() => setPage('attente')} badge={stats.attente} />
          <NavButton icon={<ClipboardList />} label="Cahier" active={page === 'demandes'} onClick={() => setPage('demandes')} badge={demandes.length} />
          <NavButton icon={<FileText />} label="Devis" active={page === 'devis'} onClick={() => setPage('devis')} badge={devis.length} />
          <NavButton icon={<Archive />} label="Factures" active={page === 'factures'} onClick={() => setPage('factures')} badge={factures.length} />
          <NavButton icon={<Users />} label="Comptes admin" active={page === 'comptes'} onClick={() => setPage('comptes')} />
        </nav>
        <div className="sidebar-footer">
          <div className="user-pill"><Shield size={18} /><div><b>{offlineMode ? 'Mode local' : profile?.display_name || 'Admin'}</b><span>{offlineMode ? 'Supabase non configuré' : cleanUsername(profile?.username || 'admin')}</span></div></div>
          <button className="ghost-button logout" onClick={signOut}><LogOut size={18} /> Quitter</button>
        </div>
      </aside>

      <main className="main-content">
        <TopBar message={message} onClear={() => setMessage('')} offlineMode={offlineMode} onRefresh={loadAll} />

        {page === 'dashboard' && (
          <Dashboard
            stats={stats}
            onNew={() => { setSelectedDemande(createEmptyDemande()); setPage('demande-edit'); }}
            onOpenAttente={() => setPage('attente')}
            onOpenDemandes={() => setPage('demandes')}
            onOpenDevis={() => setPage('devis')}
            onOpenFactures={() => setPage('factures')}
            onNewFacture={() => { setSelectedFacture(createEmptyFacture()); setPage('facture-edit'); }}
          />
        )}

        {page === 'attente' && <AttenteList demandes={demandes} onNew={() => { setSelectedDemande(createEmptyDemande()); setPage('demande-edit'); }} onEdit={(d) => { setSelectedDemande(d); setPage('demande-edit'); }} onResume={resumeDemande} onDelete={deleteDemande} onTransform={transformDemandeToDevis} />}
        {page === 'demandes' && <DemandesList demandes={demandes} onNew={() => { setSelectedDemande(createEmptyDemande()); setPage('demande-edit'); }} onEdit={(d) => { setSelectedDemande(d); setPage('demande-edit'); }} onDelete={deleteDemande} onTransform={transformDemandeToDevis} />}
        {page === 'demande-edit' && <DemandeEditor initial={selectedDemande || createEmptyDemande()} onSave={saveDemande} onBack={() => setPage('demandes')} onGoAttente={() => setPage('attente')} onDelete={deleteDemande} onTransform={transformDemandeToDevis} />}

        {page === 'devis' && <DevisList devis={devis} onNew={() => { setSelectedDevis(createEmptyDevis()); setPage('devis-edit'); }} onEdit={(d) => { setSelectedDevis(d); setPage('devis-edit'); }} onDelete={deleteDevis} onPrint={printDevis} onWhatsapp={sendWhatsappDevis} onEmail={sendEmailDevis} onFacture={transformDevisToFacture} />}
        {page === 'devis-edit' && <DevisEditor initial={selectedDevis || createEmptyDevis()} onSave={saveDevis} onBack={() => setPage('devis')} onDelete={deleteDevis} onFacture={transformDevisToFacture} />}

        {page === 'factures' && <FacturesList factures={factures} onNew={() => { setSelectedFacture(createEmptyFacture()); setPage('facture-edit'); }} onEdit={(f) => { setSelectedFacture(f); setPage('facture-edit'); }} onDelete={deleteFacture} onPrint={printFacture} />}
        {page === 'facture-edit' && <FactureEditor initial={selectedFacture || createEmptyFacture()} onSave={saveFacture} onBack={() => setPage('factures')} onDelete={deleteFacture} />}

        {page === 'comptes' && <AccountsPage profiles={profiles} offlineMode={offlineMode} currentUserId={session?.user?.id} onReload={loadAll} onMessage={setMessage} />}
      </main>
    </div>
  );
}

function Splash() {
  return <div className="splash"><img src={logo} alt="Logo" /><h1>Cahier THE KING PIECES AUTOS</h1><p>Chargement...</p></div>;
}

function LoginPage({ onMessage, message }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ display_name: 'Mokrane', username: 'mokrane', password: '' });

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    onMessage('');
    try {
      if (!isSupabaseConfigured || !supabase) { onMessage('Supabase n’est pas configuré. Remplis le fichier .env puis relance npm run dev.'); return; }
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(form.username), password: form.password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: usernameToEmail(form.username), password: form.password,
          options: { data: { username: cleanUsername(form.username), display_name: form.display_name, role: 'admin' } },
        });
        if (error) throw error;
        onMessage('Compte admin créé. Connecte-toi avec ton identifiant et ton mot de passe.');
        setMode('login');
      }
    } catch (error) { onMessage(error.message || 'Erreur de connexion.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="login-page">
      <div className="login-visual"><img src={dashboardHero} alt="THE KING PIECES AUTOS" /></div>
      <div className="login-panel">
        <img className="login-logo" src={logo} alt="Logo" />
        <p className="eyebrow">Cahier professionnel</p>
        <h1>THE KING PIECES AUTOS</h1>
        <p>Connexion simple pour gérer les demandes, les devis et les factures clients.</p>
        <div className="tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Connexion</button><button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Créer admin</button></div>
        <form onSubmit={submit} className="form-grid one">
          {mode === 'create' && <label>Nom affiché<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Ex : Mokrane" required /></label>}
          <label>Identifiant<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Ex : mokrane" required /></label>
          <label>Mot de passe<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mot de passe" required minLength={6} /></label>
          <button className="primary-button" disabled={loading}>{loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : 'Créer le compte admin'}</button>
        </form>
        {message && <div className="notice">{message}</div>}
        <div className="login-help">Important : dans Supabase, active Email provider et désactive la confirmation email.</div>
      </div>
    </div>
  );
}

function NavButton({ icon, label, active, onClick, badge }) {
  return <button className={classNames('nav-button', active && 'active')} onClick={onClick}>{React.cloneElement(icon, { size: 20 })}<span>{label}</span>{badge !== undefined && <b>{badge}</b>}</button>;
}

function TopBar({ message, onClear, offlineMode, onRefresh }) {
  return (
    <header className="top-bar">
      <div><h2>Cahier THE KING PIECES AUTOS</h2><p>{formatDate(todayIso())} · Sauvegarde {offlineMode ? 'locale' : 'Supabase'}</p></div>
      <div className="top-actions">{message && <div className="toast"><span>{message}</span><button onClick={onClear}><X size={16} /></button></div>}{!offlineMode && <button className="ghost-button" onClick={onRefresh}><RefreshCw size={18} /> Actualiser</button>}</div>
    </header>
  );
}

function Dashboard({ stats, onNew, onOpenAttente, onOpenDemandes, onOpenDevis, onOpenFactures, onNewFacture }) {
  return (
    <div className="page-stack">
      <section className="home-pro">
        <div className="home-copy">
          <p className="eyebrow">Accueil</p>
          <h1>Bienvenue dans votre cahier professionnel.</h1>
          <p>Choisissez une action pour créer une demande, consulter le cahier, préparer un devis ou imprimer une facture.</p>
          <div className="home-actions">
            <button className="big-action primary" onClick={onNew}><Plus size={28} /> Nouvelle demande</button>
            <button className="big-action" onClick={onOpenAttente}><ClipboardList size={28} /> Dossiers en attente</button>
            <button className="big-action" onClick={onOpenDemandes}><ClipboardList size={28} /> Ouvrir le cahier</button>
            <button className="big-action" onClick={onOpenDevis}><FileText size={28} /> Ouvrir les devis</button>
            <button className="big-action" onClick={onOpenFactures}><Archive size={28} /> Factures clients</button>
          </div>
        </div>
        <div className="home-logo-card"><img src={logo} alt="Logo" /><span>THE KING PIECES AUTOS</span></div>
      </section>

      <section className="quick-actions-panel">
        <button onClick={onNew}><Plus size={22} /><b>Créer une demande</b><span>Téléphone, WhatsApp ou sur place</span></button>
        <button onClick={onNewFacture}><Archive size={22} /><b>Créer une facture client</b><span>Créer, modifier et imprimer</span></button>
        <button onClick={onOpenAttente}><ClipboardList size={22} /><b>Dossiers en attente</b><span>{stats.attente} dossier(s) à reprendre</span></button>
        <button onClick={onOpenDemandes}><ClipboardList size={22} /><b>Cahier professionnel</b><span>{stats.demandes} dossiers enregistrés</span></button>
        <button onClick={onOpenDevis}><FileText size={22} /><b>Devis imprimables</b><span>{stats.devis} devis créés</span></button>
      </section>
    </div>
  );
}

function statusClass(statut) {
  if (statut === 'En attente') return 'wait';
  if (statut === 'Traité') return 'done';
  if (statut === 'Envoyé en devis') return 'sent';
  if (statut === 'Annulé') return 'cancel';
  return 'sent';
}

function Empty({ text }) { return <div className="empty"><Eye size={22} /><span>{text}</span></div>; }

function DemandCard({ d, onEdit, onDelete, onTransform, onResume }) {
  return (
    <article className="professional-card demand-card">
      <div className="card-main">
        <div className="card-top"><b>{d.numero || 'Demande'}</b><span className={`status ${statusClass(d.statut)}`}>{d.statut}</span></div>
        <h2>{d.client_nom || 'Client non renseigné'}</h2>
        <div className="card-details">
          <span><strong>Téléphone</strong>{d.client_tel || '—'}</span>
          <span><strong>Origine</strong>{d.origine || '—'}</span>
          <span><strong>Véhicule</strong>{d.marque || '—'} {d.modele || ''}</span>
          <span><strong>Plaque</strong>{d.plaque || '—'}</span>
          <span><strong>VIN</strong>{d.vin || '—'}</span>
          <span><strong>Salarié</strong>{d.salarie_nom || '—'}</span>
        </div>
        <div className="card-total"><span>Total propositions</span><b>{money(totalDemande(d))}</b></div>
      </div>
      <div className="card-actions always-visible">
        {onResume && d.statut === 'En attente' && <button className="success" onClick={() => onResume(d)}><Check size={18} /> Reprendre le dossier</button>}
        <button className="edit" onClick={() => onEdit(d)}><Edit3 size={18} /> Modifier</button>
        <button onClick={() => onTransform(d)}><FileText size={18} /> Faire le devis</button>
        <button className="delete" onClick={() => onDelete(d.id)}><Trash2 size={18} /> Supprimer</button>
      </div>
    </article>
  );
}

function DemandesList({ demandes, onNew, onEdit, onDelete, onTransform }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Tous');
  const filtered = demandes.filter((d) => {
    const haystack = `${d.numero} ${d.client_nom} ${d.client_tel} ${d.plaque} ${d.marque} ${d.modele} ${d.vin} ${d.salarie_nom}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (status === 'Tous' || d.statut === status);
  });
  return (
    <div className="page-stack">
      <div className="section-title"><div><p className="eyebrow dark">Cahier professionnel</p><h1>Demandes clients</h1><p>Chaque dossier est affiché avec les actions visibles : modifier, faire le devis ou supprimer.</p></div><button className="primary-button big" onClick={onNew}><Plus size={18} /> Nouvelle demande</button></div>
      <div className="filters-card"><label className="search-input"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche plaque, client, téléphone, VIN, salarié..." /></label><select value={status} onChange={(e) => setStatus(e.target.value)}><option>Tous</option><option>En attente</option><option>Traité</option><option>Envoyé en devis</option><option>Annulé</option></select></div>
      {filtered.length === 0 ? <Empty text="Aucune demande trouvée." /> : <section className="cards-list">{filtered.map((d) => <DemandCard key={d.id} d={d} onEdit={onEdit} onDelete={onDelete} onTransform={onTransform} />)}</section>}
    </div>
  );
}


function AttenteList({ demandes, onNew, onEdit, onResume, onDelete, onTransform }) {
  const [search, setSearch] = useState('');
  const filtered = demandes.filter((d) => {
    const haystack = `${d.numero} ${d.client_nom} ${d.client_tel} ${d.plaque} ${d.marque} ${d.modele} ${d.vin} ${d.salarie_nom}`.toLowerCase();
    return d.statut === 'En attente' && haystack.includes(search.toLowerCase());
  });
  return (
    <div className="page-stack">
      <div className="section-title"><div><p className="eyebrow dark">Dossiers en attente</p><h1>Demandes à reprendre</h1><p>Quand tu cliques sur “Mettre en attente”, le dossier part ici. Tu peux revenir dessus plus tard avec “Reprendre le dossier”.</p></div><button className="primary-button big" onClick={onNew}><Plus size={18} /> Nouvelle demande</button></div>
      <div className="filters-card"><label className="search-input"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche plaque, client, téléphone, VIN, salarié..." /></label></div>
      {filtered.length === 0 ? <Empty text="Aucun dossier en attente." /> : <section className="cards-list">{filtered.map((d) => <DemandCard key={d.id} d={d} onEdit={onEdit} onResume={onResume} onDelete={onDelete} onTransform={onTransform} />)}</section>}
    </div>
  );
}

function DemandeEditor({ initial, onSave, onBack, onGoAttente, onDelete, onTransform }) {
  const [draft, setDraft] = useState(cleanDemande(initial));
  const [saving, setSaving] = useState(false);
  function update(field, value) { setDraft((d) => ({ ...d, [field]: value })); }
  function addProposition() { setDraft((d) => ({ ...d, propositions: [...d.propositions, createProposition(d.propositions.length + 1)] })); }
  function updateProposition(propId, patch) { setDraft((d) => ({ ...d, propositions: d.propositions.map((p) => p.id === propId ? { ...p, ...patch } : p) })); }
  function removeProposition(propId) { setDraft((d) => ({ ...d, propositions: d.propositions.length > 1 ? d.propositions.filter((p) => p.id !== propId) : d.propositions })); }
  function addPiece(propId) { setDraft((d) => ({ ...d, propositions: d.propositions.map((p) => p.id === propId ? { ...p, pieces: [...p.pieces, createPiece()] } : p) })); }
  function updatePiece(propId, pieceId, patch) { setDraft((d) => ({ ...d, propositions: d.propositions.map((p) => p.id === propId ? { ...p, pieces: p.pieces.map((piece) => piece.id === pieceId ? { ...piece, ...patch } : piece) } : p) })); }
  function removePiece(propId, pieceId) { setDraft((d) => ({ ...d, propositions: d.propositions.map((p) => p.id === propId ? { ...p, pieces: p.pieces.length > 1 ? p.pieces.filter((piece) => piece.id !== pieceId) : p.pieces } : p) })); }
  async function manualSave() { setSaving(true); try { const saved = await onSave(draft); if (saved) setDraft(cleanDemande(saved)); } finally { setSaving(false); } }
  async function saveAsPending() {
    setSaving(true);
    try {
      const saved = await onSave({ ...draft, statut: 'En attente' });
      if (saved) setDraft(cleanDemande(saved));
      onGoAttente?.();
    } finally { setSaving(false); }
  }

  return (
    <div className="page-stack">
      <div className="section-title"><div><p className="eyebrow dark">Dossier client</p><h1>{draft.numero || 'Nouvelle demande'}</h1><p>Par défaut le dossier est traité directement. Clique sur “Mettre en attente” pour le ranger dans la partie “En attente” et le reprendre plus tard.</p></div><div className="toolbar"><button className="ghost-button" onClick={onBack}><ArrowLeft size={18} /> Retour</button>{draft.statut === 'En attente' ? <button className="primary-button soft" onClick={() => update('statut', 'Traité')}><Check size={18} /> Reprendre maintenant</button> : <button className="wait-button" onClick={saveAsPending} disabled={saving}><ClipboardList size={18} /> Mettre en attente</button>}<button className="primary-button" onClick={manualSave} disabled={saving}><Save size={18} /> {saving ? 'Sauvegarde...' : 'Enregistrer'}</button><button className="ghost-button" onClick={() => onTransform(draft)}><FileText size={18} /> Faire le devis</button>{draft.id && <button className="danger-button" onClick={() => onDelete(draft.id)}><Trash2 size={18} /> Supprimer</button>}</div></div>
      <section className="card form-card"><h2>Informations principales</h2><div className="current-status"><span>Dossier :</span><b className={`status ${statusClass(draft.statut)}`}>{draft.statut}</b></div><div className="form-grid three"><label>Origine<select value={draft.origine} onChange={(e) => update('origine', e.target.value)}><option>Téléphone</option><option>WhatsApp</option><option>Sur place</option></select></label><label>Nom client<input value={draft.client_nom} onChange={(e) => update('client_nom', e.target.value)} placeholder="Nom du client" /></label><label>Téléphone<input value={draft.client_tel} onChange={(e) => update('client_tel', e.target.value)} placeholder="06..." /></label></div><div className="form-grid five"><label>Plaque<input value={draft.plaque} onChange={(e) => update('plaque', e.target.value.toUpperCase())} /></label><label>Marque<input value={draft.marque} onChange={(e) => update('marque', e.target.value)} /></label><label>Modèle<input value={draft.modele} onChange={(e) => update('modele', e.target.value)} /></label><label>VIN / châssis<input value={draft.vin} onChange={(e) => update('vin', e.target.value.toUpperCase())} /></label><label>Salarié<input value={draft.salarie_nom} onChange={(e) => update('salarie_nom', e.target.value)} /></label></div></section>
      <section className="card form-card"><div className="proposal-header"><div><h2>Pièces demandées</h2><p>Ajoute une ou plusieurs propositions si tu as plusieurs prix ou disponibilités.</p></div><button className="ghost-button" onClick={addProposition}><Plus size={18} /> Ajouter une proposition</button></div>{draft.propositions.map((prop, pIndex) => <div className="proposal-card" key={prop.id}><div className="proposal-title"><input value={prop.titre} onChange={(e) => updateProposition(prop.id, { titre: e.target.value })} /><div><b>{money(totalProposition(prop))}</b>{draft.propositions.length > 1 && <button className="icon-danger" onClick={() => removeProposition(prop.id)}><Trash2 size={16} /></button>}</div></div>{prop.pieces.map((piece, index) => <PieceRow key={piece.id} index={index + 1} piece={piece} onChange={(patch) => updatePiece(prop.id, piece.id, patch)} onRemove={() => removePiece(prop.id, piece.id)} canRemove={prop.pieces.length > 1} />)}<div className="proposal-footer"><button className="ghost-button" onClick={() => addPiece(prop.id)}><Plus size={18} /> Ajouter une pièce</button><button className="primary-button soft" onClick={() => onTransform(draft, prop.id)}><FileText size={18} /> Transformer cette proposition en devis</button></div></div>)}</section>
      <section className="card form-card"><h2>Notes internes</h2><textarea value={draft.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Note interne, rappel fournisseur, commentaire..." rows={4} /></section>
    </div>
  );
}

function PieceRow({ index, piece, onChange, onRemove, canRemove }) {
  async function handlePaste(e) {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        const dataUrl = await imageFileToDataUrl(file);
        onChange({ photo: dataUrl });
        e.preventDefault();
        return;
      }
    }
  }
  async function handleFile(e) { const file = e.target.files?.[0]; if (!file) return; onChange({ photo: await imageFileToDataUrl(file) }); }
  return (
    <div className="piece-row">
      <div className="piece-number">{index}</div>
      <div className="piece-photo" tabIndex={0} onPaste={handlePaste} title="Clique ici puis CTRL+V pour coller une photo">{piece.photo ? <img src={piece.photo} alt="Pièce" /> : <span>Image<br />CTRL+V</span>}<label className="photo-upload"><Upload size={15} /><input type="file" accept="image/*" onChange={handleFile} /></label></div>
      <div className="piece-fields"><div className="form-grid five"><label>Désignation<input value={piece.designation} onChange={(e) => onChange({ designation: e.target.value })} placeholder="Ex : Alternateur" /></label><label>Référence interne<input value={piece.reference} onChange={(e) => onChange({ reference: e.target.value })} placeholder="Référence magasin" /></label><label>Qté<input type="number" min="0" value={piece.quantite} onChange={(e) => onChange({ quantite: e.target.value })} /></label><label>Prix TTC<input type="number" min="0" step="0.01" value={piece.prix_ttc} onChange={(e) => onChange({ prix_ttc: e.target.value })} placeholder="0.00" /></label><label>Disponibilité<input value={piece.disponibilite} onChange={(e) => onChange({ disponibilite: e.target.value })} placeholder="Disponible / Demain..." /></label></div><div className="piece-total">Total ligne : {money(totalPiece(piece))}</div></div>
      {canRemove && <button className="icon-danger" onClick={onRemove}><Trash2 size={17} /></button>}
    </div>
  );
}

function DevisList({ devis, onNew, onEdit, onDelete, onPrint, onWhatsapp, onEmail, onFacture }) {
  const [search, setSearch] = useState('');
  const filtered = devis.filter((d) => `${d.numero} ${d.client_nom} ${d.client_tel} ${d.plaque} ${d.marque} ${d.modele} ${d.vin}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="page-stack">
      <div className="section-title"><div><p className="eyebrow dark">Devis</p><h1>Devis clients</h1><p>Les références restent internes et ne sortent pas sur l’impression client.</p></div><button className="primary-button big" onClick={onNew}><Plus size={18} /> Nouveau devis</button></div>
      <div className="filters-card"><label className="search-input"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche devis, client, plaque, téléphone..." /></label></div>
      {filtered.length === 0 ? <Empty text="Aucun devis trouvé." /> : <section className="cards-list">{filtered.map((d) => { const totals = d.totals || totalsFromLines(d.lignes || []); return <article className="professional-card devis-card" key={d.id}><div className="card-main"><div className="card-top"><b>{d.numero || 'Devis'}</b><span className="status sent">{d.statut || 'Brouillon'}</span></div><h2>{d.client_nom || 'Client non renseigné'}</h2><div className="card-details"><span><strong>Téléphone</strong>{d.client_tel || '—'}</span><span><strong>Véhicule</strong>{d.marque || '—'} {d.modele || ''}</span><span><strong>Plaque</strong>{d.plaque || '—'}</span><span><strong>Date</strong>{formatDate(d.updated_at)}</span></div><div className="card-total"><span>Total TTC</span><b>{money(totals.total_ttc)}</b></div></div><div className="card-actions always-visible"><button className="edit" onClick={() => onEdit(d)}><Edit3 size={18} /> Modifier</button><button onClick={() => onPrint(d)}><Printer size={18} /> Imprimer</button><button onClick={() => onWhatsapp(d)}><MessageCircle size={18} /> WhatsApp</button><button onClick={() => onEmail(d)}><Mail size={18} /> Email</button><button className="success" onClick={() => onFacture(d)}><Archive size={18} /> Faire facture</button><button className="delete" onClick={() => onDelete(d.id)}><Trash2 size={18} /> Supprimer</button></div></article>; })}</section>}
    </div>
  );
}

function DevisEditor({ initial, onSave, onBack, onDelete, onFacture }) {
  const [draft, setDraft] = useState({ ...createEmptyDevis(), ...initial, lignes: Array.isArray(initial.lignes) && initial.lignes.length ? initial.lignes : [createDevisLine()] });
  const totals = totalsFromLines(draft.lignes);
  function updateLine(id, patch) { setDraft((d) => ({ ...d, lignes: d.lignes.map((line) => line.id === id ? { ...line, ...patch } : line) })); }
  function addLine() { setDraft((d) => ({ ...d, lignes: [...d.lignes, createDevisLine()] })); }
  function removeLine(id) { setDraft((d) => ({ ...d, lignes: d.lignes.length > 1 ? d.lignes.filter((line) => line.id !== id) : d.lignes })); }
  async function manualSave() { const saved = await onSave(draft); if (saved) setDraft({ ...saved, lignes: saved.lignes?.length ? saved.lignes : [createDevisLine()] }); }
  return (
    <div className="page-stack">
      <div className="section-title"><div><p className="eyebrow dark">Édition devis</p><h1>{draft.numero || 'Nouveau devis'}</h1><p>Modèle professionnel. Numéro automatique au premier enregistrement.</p></div><div className="toolbar"><button className="ghost-button" onClick={onBack}><ArrowLeft size={18} /> Retour</button><button className="primary-button" onClick={manualSave}><Save size={18} /> Enregistrer</button><button className="ghost-button" onClick={() => printDevis({ ...draft, totals })}><Printer size={18} /> Imprimer</button><button className="success-button" onClick={() => onFacture({ ...draft, totals })}><Archive size={18} /> Faire facture</button>{draft.id && <button className="danger-button" onClick={() => onDelete(draft.id)}><Trash2 size={18} /> Supprimer</button>}</div></div>
      <section className="card form-card"><h2>Informations devis</h2><div className="form-grid three"><label>Nom client<input value={draft.client_nom || ''} onChange={(e) => setDraft({ ...draft, client_nom: e.target.value })} /></label><label>Téléphone<input value={draft.client_tel || ''} onChange={(e) => setDraft({ ...draft, client_tel: e.target.value })} /></label><label>Statut<select value={draft.statut || 'Brouillon'} onChange={(e) => setDraft({ ...draft, statut: e.target.value })}><option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Refusé</option></select></label></div><div className="form-grid four"><label>Marque<input value={draft.marque || ''} onChange={(e) => setDraft({ ...draft, marque: e.target.value })} /></label><label>Modèle<input value={draft.modele || ''} onChange={(e) => setDraft({ ...draft, modele: e.target.value })} /></label><label>Plaque<input value={draft.plaque || ''} onChange={(e) => setDraft({ ...draft, plaque: e.target.value.toUpperCase() })} /></label><label>VIN<input value={draft.vin || ''} onChange={(e) => setDraft({ ...draft, vin: e.target.value.toUpperCase() })} /></label></div></section>
      <section className="card form-card"><div className="proposal-header"><h2>Lignes du devis</h2><button className="ghost-button" onClick={addLine}><Plus size={18} /> Ajouter une ligne</button></div>{draft.lignes.map((line, index) => <div className="devis-line" key={line.id || index}><b>{index + 1}</b><input value={line.designation || ''} onChange={(e) => updateLine(line.id, { designation: e.target.value })} placeholder="Désignation" /><input type="number" min="0" value={line.quantite || 1} onChange={(e) => updateLine(line.id, { quantite: e.target.value })} placeholder="Qté" /><input type="number" min="0" step="0.01" value={line.prix_ttc || ''} onChange={(e) => updateLine(line.id, { prix_ttc: e.target.value })} placeholder="Prix TTC" /><input value={line.disponibilite || ''} onChange={(e) => updateLine(line.id, { disponibilite: e.target.value })} placeholder="Disponibilité" /><button className="icon-danger" onClick={() => removeLine(line.id)}><Trash2 size={16} /></button></div>)}<div className="total-panel inline"><span>Total HT <b>{money(totals.total_ht)}</b></span><span>TVA 20% <b>{money(totals.tva)}</b></span><strong>Total TTC <b>{money(totals.total_ttc)}</b></strong></div></section>
    </div>
  );
}

function FacturesList({ factures, onNew, onEdit, onDelete, onPrint }) {
  const [search, setSearch] = useState('');
  const filtered = factures.filter((f) => `${f.numero} ${f.client_nom} ${f.client_adresse} ${f.client_cp_ville}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="page-stack">
      <div className="section-title"><div><p className="eyebrow dark">Factures clients</p><h1>Factures clients</h1><p>Créez, modifiez et imprimez vos factures clients.</p></div><button className="primary-button big" onClick={onNew}><Plus size={18} /> Nouvelle facture</button></div>
      <div className="filters-card"><label className="search-input"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche facture, client, adresse..." /></label></div>
      {filtered.length === 0 ? <Empty text="Aucune facture trouvée." /> : <section className="cards-list">{filtered.map((f) => { const totals = f.totals || totalsFromFacture(f.lignes || []); return <article className="professional-card facture-card" key={f.id}><div className="card-main"><div className="card-top"><b>{f.numero || 'Facture sans numéro'}</b><span className="status done">{f.statut || 'Brouillon'}</span></div><h2>{f.client_nom || 'Client comptoir / non renseigné'}</h2><div className="card-details"><span><strong>Date facture</strong>{formatDate(f.date_facture)}</span><span><strong>Échéance</strong>{formatDate(f.date_echeance)}</span><span><strong>Mode</strong>{f.mode_reglement || '—'}</span><span><strong>Payée le</strong>{formatDate(f.paye_le) || '—'}</span></div><div className="card-total"><span>Total TTC</span><b>{money(totals.total_ttc)}</b></div></div><div className="card-actions always-visible"><button className="edit" onClick={() => onEdit(f)}><Edit3 size={18} /> Modifier</button><button onClick={() => onPrint(f)}><Printer size={18} /> Imprimer</button><button className="delete" onClick={() => onDelete(f.id)}><Trash2 size={18} /> Supprimer</button></div></article>; })}</section>}
    </div>
  );
}

function FactureEditor({ initial, onSave, onBack, onDelete }) {
  const [draft, setDraft] = useState({ ...createEmptyFacture(), ...initial, lignes: Array.isArray(initial.lignes) && initial.lignes.length ? initial.lignes : [createFactureLine()] });
  const totals = totalsFromFacture(draft.lignes);
  function updateLine(id, patch) { setDraft((d) => ({ ...d, lignes: d.lignes.map((line) => line.id === id ? { ...line, ...patch } : line) })); }
  function addLine() { setDraft((d) => ({ ...d, lignes: [...d.lignes, createFactureLine()] })); }
  function removeLine(id) { setDraft((d) => ({ ...d, lignes: d.lignes.length > 1 ? d.lignes.filter((line) => line.id !== id) : d.lignes })); }
  async function manualSave() { const saved = await onSave({ ...draft, totals }); if (saved) setDraft({ ...saved, lignes: saved.lignes?.length ? saved.lignes : [createFactureLine()] }); }
  return (
    <div className="page-stack">
      <div className="section-title"><div><p className="eyebrow dark">Facture client</p><h1>{draft.numero || 'Nouvelle facture'}</h1><p>Remplissez les informations de la facture puis imprimez-la.</p></div><div className="toolbar"><button className="ghost-button" onClick={onBack}><ArrowLeft size={18} /> Retour</button><button className="primary-button" onClick={manualSave}><Save size={18} /> Enregistrer</button><button className="ghost-button" onClick={() => printFacture({ ...draft, totals })}><Printer size={18} /> Imprimer</button>{draft.id && <button className="danger-button" onClick={() => onDelete(draft.id)}><Trash2 size={18} /> Supprimer</button>}</div></div>
      <section className="card form-card"><h2>Informations facture</h2><div className="form-grid four"><label>Numéro de facture<input value={draft.numero || ''} onChange={(e) => setDraft({ ...draft, numero: e.target.value })} placeholder="Ex : FACT/2026/01168" required /></label><label>Date de facture<input type="date" value={draft.date_facture || todayIso()} onChange={(e) => setDraft({ ...draft, date_facture: e.target.value })} required /></label><label>Date d’échéance<input type="date" value={draft.date_echeance || todayIso()} onChange={(e) => setDraft({ ...draft, date_echeance: e.target.value })} /></label><label>Statut<select value={draft.statut || 'Payée'} onChange={(e) => setDraft({ ...draft, statut: e.target.value })}><option>Brouillon</option><option>Payée</option><option>En attente</option></select></label></div><div className="form-grid three"><label>Nom client<input value={draft.client_nom || ''} onChange={(e) => setDraft({ ...draft, client_nom: e.target.value })} placeholder="Facultatif" /></label><label>Adresse<input value={draft.client_adresse || ''} onChange={(e) => setDraft({ ...draft, client_adresse: e.target.value })} placeholder="Facultatif" /></label><label>CP / Ville<input value={draft.client_cp_ville || ''} onChange={(e) => setDraft({ ...draft, client_cp_ville: e.target.value })} placeholder="Facultatif" /></label></div><div className="form-grid three"><label>Payée le<input type="date" value={draft.paye_le || ''} onChange={(e) => setDraft({ ...draft, paye_le: e.target.value })} /></label><label>Mode de règlement<input value={draft.mode_reglement || ''} onChange={(e) => setDraft({ ...draft, mode_reglement: e.target.value })} placeholder="Virement / Espèces / CB..." /></label><label>Note<input value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Note interne ou mention" /></label></div></section>
      <section className="card form-card"><div className="proposal-header"><h2>Lignes facture</h2><button className="ghost-button" onClick={addLine}><Plus size={18} /> Ajouter une ligne</button></div>{draft.lignes.map((line, index) => { const t = totalFactureLine(line); return <div className="facture-line" key={line.id || index}><b>{index + 1}</b><input value={line.description || ''} onChange={(e) => updateLine(line.id, { description: e.target.value })} placeholder="Description" /><input type="number" min="0" value={line.quantite || 1} onChange={(e) => updateLine(line.id, { quantite: e.target.value })} placeholder="Qté" /><input type="number" min="0" step="0.01" value={line.prix_ht || ''} onChange={(e) => updateLine(line.id, { prix_ht: e.target.value })} placeholder="Prix HT" /><input type="number" min="0" step="1" value={line.tva || 20} onChange={(e) => updateLine(line.id, { tva: e.target.value })} placeholder="TVA %" /><span className="line-amount">{money(t.ttc)}</span><button className="icon-danger" onClick={() => removeLine(line.id)}><Trash2 size={16} /></button></div>; })}<div className="total-panel inline"><span>Montant HT <b>{money(totals.total_ht)}</b></span><span>TVA <b>{money(totals.tva)}</b></span><strong>Total TTC <b>{money(totals.total_ttc)}</b></strong></div></section>
    </div>
  );
}

function AccountsPage({ profiles, offlineMode, currentUserId, onReload, onMessage }) {
  const [form, setForm] = useState({ display_name: '', username: '', password: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ display_name: '', username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  async function createAccount(e) {
    e.preventDefault();
    if (offlineMode) { onMessage('Les comptes admin nécessitent Supabase. Configure .env puis relance le site.'); return; }
    setLoading(true);
    try {
      const client = createNoPersistSupabaseClient();
      const { error } = await client.auth.signUp({
        email: usernameToEmail(form.username),
        password: form.password,
        options: { data: { username: cleanUsername(form.username), display_name: form.display_name, role: 'admin' } },
      });
      if (error) throw error;
      setForm({ display_name: '', username: '', password: '' });
      onMessage('Compte admin créé.');
      await onReload();
    } catch (error) { onMessage(`Erreur création compte : ${error.message}`); }
    finally { setLoading(false); }
  }

  function startEdit(profile) {
    setEditingId(profile.id);
    setEditForm({ display_name: profile.display_name || '', username: profile.username || '', password: '' });
  }

  async function saveAccount(profileId) {
    if (offlineMode) { onMessage('La modification des comptes nécessite Supabase.'); return; }
    setEditLoading(true);
    try {
      const payload = {
        target_id: profileId,
        new_username: editForm.username,
        new_display_name: editForm.display_name,
        new_password: editForm.password || null,
      };
      const { error } = await supabase.rpc('update_admin_account', payload);
      if (error) throw error;
      setEditingId(null);
      setEditForm({ display_name: '', username: '', password: '' });
      onMessage('Compte admin modifié.');
      await onReload();
    } catch (error) {
      onMessage(`Erreur modification compte : ${error.message}. Si tu viens d’installer cette version, colle le nouveau SQL V10 dans Supabase.`);
    } finally { setEditLoading(false); }
  }

  async function deleteAccount(profileItem) {
    if (offlineMode) { onMessage('La suppression des comptes nécessite Supabase.'); return; }
    if (profileItem.id === currentUserId) { onMessage('Tu ne peux pas supprimer le compte actuellement connecté.'); return; }
    if (profiles.length <= 1) { onMessage('Impossible de supprimer le dernier compte admin.'); return; }
    if (!window.confirm(`Supprimer le compte admin ${profileItem.display_name || profileItem.username} ?`)) return;
    setEditLoading(true);
    try {
      const { error } = await supabase.rpc('delete_admin_account', { target_id: profileItem.id });
      if (error) throw error;
      onMessage('Compte admin supprimé.');
      await onReload();
    } catch (error) {
      onMessage(`Erreur suppression compte : ${error.message}. Si tu viens d’installer cette version, colle le nouveau SQL V10 dans Supabase.`);
    } finally { setEditLoading(false); }
  }

  return (
    <div className="page-stack">
      <div className="section-title">
        <div>
          <p className="eyebrow dark">Administration</p>
          <h1>Comptes admin</h1>
          <p>Crée, modifie ou supprime les comptes administrateur du logiciel.</p>
        </div>
      </div>

      <section className="card form-card">
        <h2>Créer un compte admin</h2>
        <form className="form-grid four" onSubmit={createAccount}>
          <label>Nom affiché<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required placeholder="Ex : Mokrane" /></label>
          <label>Identifiant<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required placeholder="Ex : mokrane" /></label>
          <label>Mot de passe<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} /></label>
          <button className="primary-button submit-align" disabled={loading}>{loading ? 'Création...' : 'Créer'}</button>
        </form>
      </section>

      <section className="card">
        <h2>Admins existants</h2>
        {profiles.length === 0 ? <Empty text="Aucun compte affiché." /> : (
          <div className="table-card accounts-table">
            <table>
              <thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {profiles.map((p) => {
                  const isEditing = editingId === p.id;
                  const isCurrent = p.id === currentUserId;
                  return (
                    <tr key={p.id}>
                      <td>{isEditing ? <input className="table-input" value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })} /> : (p.display_name || '—')}</td>
                      <td>{isEditing ? <input className="table-input" value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} /> : (p.username || '—')}</td>
                      <td>{p.role}{isCurrent ? <span className="current-badge">Compte connecté</span> : null}</td>
                      <td>{formatDate(p.created_at)}</td>
                      <td>
                        {isEditing ? (
                          <div className="account-actions edit-mode">
                            <input className="password-small" type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Nouveau mot de passe facultatif" minLength={6} />
                            <button className="edit" onClick={() => saveAccount(p.id)} disabled={editLoading}><Save size={16} /> Enregistrer</button>
                            <button onClick={() => { setEditingId(null); setEditForm({ display_name: '', username: '', password: '' }); }}><X size={16} /> Annuler</button>
                          </div>
                        ) : (
                          <div className="account-actions">
                            <button className="edit" onClick={() => startEdit(p)}><Edit3 size={16} /> Modifier</button>
                            <button className="delete" onClick={() => deleteAccount(p)} disabled={editLoading || isCurrent || profiles.length <= 1}><Trash2 size={16} /> Supprimer</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted-help">Pour la sécurité, le dernier compte admin ne peut pas être supprimé. Le compte actuellement connecté doit être modifié depuis un autre compte admin pour être supprimé.</p>
      </section>
    </div>
  );
}

function buildDevisMessage(d) {
  const totals = d.totals || totalsFromLines(d.lignes || []);
  const lines = (d.lignes || []).map((line) => `• ${line.designation || 'Pièce'} — Qté ${line.quantite || 1} — Prix : ${money(totalPiece(line))} — Disponibilité : ${line.disponibilite || 'Non renseignée'}`).join('\n');
  return `Bonjour ${d.client_nom || ''},\n\nVoici les éléments concernant votre demande de devis :\n${d.marque || ''} ${d.modele || ''}\nPlaque : ${d.plaque || ''}\n\n${lines}\n\nTotal TTC : ${money(totals.total_ttc)}\n\nMerci pour votre confiance. J’attends votre retour pour validation.\n${ENTREPRISE.nom}`;
}

function sendWhatsappDevis(d) {
  const choix = window.prompt(
    'Numéro WhatsApp destinataire\n\nÉcris un numéro pour envoyer directement, ou laisse vide pour choisir le contact dans WhatsApp.',
    ''
  );
  if (choix === null) return;
  const phone = normalisePhone(choix);
  const text = encodeURIComponent(buildDevisMessage(d));
  const appUrl = phone ? `whatsapp://send?phone=${phone}&text=${text}` : `whatsapp://send?text=${text}`;
  const webUrl = phone ? `https://wa.me/${phone}?text=${text}` : `https://web.whatsapp.com/send?text=${text}`;
  window.location.href = appUrl;
  window.setTimeout(() => { if (!document.hidden) window.open(webUrl, '_blank', 'noopener,noreferrer'); }, 1200);
}

function sendEmailDevis(d) {
  const subject = encodeURIComponent(`${d.numero || 'Devis'} - ${ENTREPRISE.nom}`);
  const body = encodeURIComponent(buildDevisMessage(d));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function printDevis(d) {
  const totals = d.totals || totalsFromLines(d.lignes || []);
  const hasPhotos = (d.lignes || []).some((line) => line.photo);
  const date = d.date || d.created_at || d.updated_at || todayIso();
  const conditions = "Les références mentionnées restent strictement internes au magasin. Les prix TTC sont communiqués sous réserve de disponibilité et de validation au moment de la commande. Sauf erreur de notre part ou prise en charge dans le cadre de la garantie applicable, les pièces commandées ou achetées ne sont ni reprises ni échangées. Aucun remboursement ne sera effectué. À titre commercial, un avoir valable 6 mois pourra être proposé, utilisable uniquement en magasin.";
  const rows = (d.lignes || []).map((line, index) => `
    <tr>
      <td class="num">${index + 1}</td>
      <td class="designation-cell">
        ${hasPhotos ? `<div class="line-with-photo">${line.photo ? `<img src="${line.photo}" />` : `<span class="no-photo">—</span>`}<div>` : ''}
        <div class="line-title">${escapeHtml(line.designation || 'Pièce')}</div>
        <div class="line-subtitle">${escapeHtml(line.disponibilite || 'Disponibilité non renseignée')}</div>
        ${hasPhotos ? '</div></div>' : ''}
      </td>
      <td class="center">${Number(line.quantite || 0)}</td>
      <td class="right">${money(line.prix_ttc)}</td>
      <td class="right"><strong>${money(totalPiece(line))}</strong></td>
    </tr>`).join('');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title></title><style>
  @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0!important;padding:0!important;background:#fff;color:#111827;font-family:'Trebuchet MS',Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:210mm;height:297mm;margin:0 auto;background:#fff;padding:7mm 10mm 7mm;position:relative;overflow:hidden}.header{display:grid;grid-template-columns:1fr 48mm;gap:8mm;align-items:start;border-bottom:2px solid #111;padding-bottom:4mm}.brand{display:grid;grid-template-columns:23mm 1fr;gap:5mm;align-items:center}.logo-wrap{width:23mm;height:23mm;display:grid;place-items:center}.logo-wrap img{width:100%;height:100%;object-fit:contain}.company{text-align:center}.company h1{margin:0;color:#081f49;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.05;letter-spacing:1.2px;font-weight:900}.company h2{margin:2mm 0 0;font-size:11.5px;color:#a57519;font-weight:900;letter-spacing:.8px;text-transform:uppercase}.devis-box{text-align:right}.devis-box .title{font-size:25px;letter-spacing:2px;color:#081f49;font-weight:900}.devis-box .numero{margin-top:3mm;font-size:13.5px;color:#111827;font-weight:900;letter-spacing:.3px}.devis-box .date{margin-top:1.5mm;font-size:12.5px;color:#4b5563;font-weight:800}.coords{margin-top:3mm;color:#374151;font-size:10.3px;line-height:1.35}.gold-line{height:2px;background:#c7951b;border-radius:99px;margin:4mm 0}.info{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:4mm 0}.info-card{border:1px solid #d5dce8;border-radius:2.5mm;background:#fbfdff;padding:3mm;min-height:18mm}.info-card h3{margin:0 0 2mm;color:#081f49;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px}.field{font-size:10.3px;margin:1mm 0;color:#1f2937}.field b{font-weight:900;color:#111827}table{width:100%;border-collapse:collapse;margin-top:3mm;border:1px solid #d5dce8;table-layout:fixed}th{background:#081f49;color:white;text-align:left;padding:2.2mm 2.4mm;font-size:10.3px;text-transform:uppercase;letter-spacing:.2px}td{padding:2.4mm;border-top:1px solid #e2e8f0;vertical-align:middle;font-size:10.8px}.num{width:10mm;text-align:center;font-weight:800;color:#081f49}.center{text-align:center;width:16mm}.right{text-align:right;white-space:nowrap;width:27mm}.line-title{font-size:11.3px;font-weight:900;color:#111827}.line-subtitle{font-size:9.5px;color:#64748b;margin-top:.6mm}.line-with-photo{display:grid;grid-template-columns:19mm 1fr;gap:2.5mm;align-items:center}.line-with-photo img{width:19mm;height:14mm;object-fit:contain;border:1px solid #d9e2f1;border-radius:1.5mm}.no-photo{display:grid;place-items:center;width:19mm;height:14mm;border:1px dashed #d9e2f1;color:#94a3b8}.after-table{display:grid;grid-template-columns:1fr 64mm;gap:6mm;margin-top:5mm;align-items:start}.note{border:1px solid #d5dce8;border-left:4px solid #c7951b;border-radius:2mm;padding:3mm;color:#374151;font-size:9.6px;line-height:1.38}.note b{display:block;color:#111827;margin-bottom:1mm;font-size:10px}.totals{border:1px solid #d5dce8;border-radius:2mm;overflow:hidden;background:#fff}.totals-row{display:flex;justify-content:space-between;gap:5mm;padding:2.4mm 3mm;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:900}.grand{background:#050505;border-bottom:0;color:white;font-size:13.5px}.grand span,.grand b{color:white}.footer{position:absolute;left:10mm;right:10mm;bottom:6mm;border-top:2px solid #111;padding-top:2mm;text-align:center;color:#081f49;font-weight:900;font-size:10.5px;letter-spacing:.3px}@media print{html,body{width:210mm;height:297mm}.page{margin:0!important}}
  </style></head><body><main class="page"><section class="header"><div><div class="brand"><div class="logo-wrap"><img src="${logo}" /></div><div class="company"><h1>${ENTREPRISE.nom}</h1><h2>Vente toutes marques de pièces</h2></div></div><div class="coords">📍 ${ENTREPRISE.adresse}<br />☎ ${ENTREPRISE.telephone} &nbsp;&nbsp; WhatsApp ${ENTREPRISE.whatsapp}<br />✉ ${ENTREPRISE.email} &nbsp;&nbsp; TVA : ${ENTREPRISE.tva}</div></div><div class="devis-box"><div class="title">DEVIS</div><div class="numero">${escapeHtml(d.numero || '')}</div><div class="date">${formatDate(date)}</div></div></section><div class="gold-line"></div><section class="info"><div class="info-card"><h3>Client</h3><div class="field"><b>Nom :</b> ${escapeHtml(d.client_nom || '')}</div><div class="field"><b>Téléphone :</b> ${escapeHtml(d.client_tel || '')}</div></div><div class="info-card"><h3>Véhicule</h3><div class="field"><b>Marque / modèle :</b> ${escapeHtml(`${d.marque || ''} ${d.modele || ''}`.trim())}</div><div class="field"><b>Plaque :</b> ${escapeHtml(d.plaque || '')}</div><div class="field"><b>VIN :</b> ${escapeHtml(d.vin || '')}</div></div></section><table><thead><tr><th class="num">N°</th><th>${hasPhotos ? 'Image / désignation' : 'Désignation'}</th><th class="center">Qté</th><th class="right">Prix TTC</th><th class="right">Total TTC</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucune ligne</td></tr>'}</tbody></table><section class="after-table"><div class="note"><b>Conditions de vente</b>${conditions}</div><div class="totals"><div class="totals-row"><span>Total HT</span><b>${money(totals.total_ht)}</b></div><div class="totals-row"><span>TVA 20%</span><b>${money(totals.tva)}</b></div><div class="totals-row grand"><span>Total TTC</span><b>${money(totals.total_ttc)}</b></div></div></section><section class="footer">Merci pour votre confiance — ${ENTREPRISE.nom}</section></main><script>window.onload = () => { document.title = ''; window.print(); };</script></body></html>`;
  const win = window.open('', '_blank'); win.document.write(html); win.document.close();
}

function printFacture(f) {
  const totals = f.totals || totalsFromFacture(f.lignes || []);
  const rows = (f.lignes || []).map((line) => { const t = totalFactureLine(line); return `<tr><td>${escapeHtml(line.description || '')}</td><td class="center">${Number(line.quantite || 0).toFixed(2).replace('.00', '')}</td><td class="right">${money(line.prix_ht)}</td><td class="center">TVA ${Number(line.tva || 0)}%</td><td class="right">${money(t.ht)}</td></tr>`; }).join('');
  const paid = f.statut === 'Payée' ? totals.total_ttc : 0;
  const due = Math.max(0, totals.total_ttc - paid);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title></title><style>
  @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0!important;padding:0!important;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:210mm;height:297mm;margin:0 auto;background:#fff;padding:9mm 12mm 8mm;position:relative;overflow:hidden}.top{display:grid;grid-template-columns:1fr 1fr;gap:16mm}.seller{font-size:10px;text-transform:uppercase;line-height:1.35}.seller img{width:15mm;height:11mm;object-fit:contain;display:block;margin-bottom:1mm}.top-rule{height:1px;background:#111;margin-top:1mm}.buyer{margin-top:23mm;font-size:11px;line-height:1.35;font-weight:700}.title{margin:18mm 0 6mm;color:#a57519;font-size:21px;font-weight:500}.meta{display:grid;grid-template-columns:32mm 38mm 32mm 38mm 1fr;gap:4mm;font-size:10px;margin-bottom:7mm}.meta b{display:block;margin-bottom:1.5mm}table{width:100%;border-collapse:collapse;font-size:10.8px}th{text-align:left;font-size:10px;padding:2.2mm 1mm;border-bottom:0;color:#111}td{padding:2mm 1mm;vertical-align:top}.center{text-align:center}.right{text-align:right}.summary{width:88mm;margin-left:auto;margin-top:3mm;font-size:10.5px}.sum-row{display:flex;justify-content:space-between;border-top:1px solid #111;padding:1.8mm 0}.sum-row:first-child{border-top:2px solid #111}.sum-row.gold{color:#a57519;font-weight:700}.sum-row.strong{font-weight:900}.payment-note{margin-top:8mm;color:#a57519;font-size:10px;font-weight:700}.footer{position:absolute;left:12mm;right:12mm;bottom:8mm;text-align:center;font-size:10px}.footer .rule{height:1px;background:#111;margin-bottom:2mm}.page-no{margin-top:3mm;color:#6b7280;font-size:9px}.invoice-no{margin-top:1mm;color:#6b7280;font-size:9px}@media print{html,body{width:210mm;height:297mm}.page{margin:0!important}}
  </style></head><body><main class="page"><section class="top"><div><div class="seller"><img src="${logo}" />${ENTREPRISE.nom}<br />32 AVENUE MARCEL CACHIN<br />93240 STAINS France</div><div class="top-rule"></div></div><div class="buyer">${escapeHtml(f.client_nom || 'CLIENT COMPTOIR')}<br />${escapeHtml(f.client_adresse || '')}<br />${escapeHtml(f.client_cp_ville || '')}</div></section><h1 class="title">Facture ${escapeHtml(f.numero || '')}</h1><section class="meta"><div><b>Date de la facture :</b>${formatDate(f.date_facture)}</div><div></div><div><b>Date d’échéance :</b>${formatDate(f.date_echeance)}</div><div></div><div></div></section><table><thead><tr><th>Description</th><th class="center">Quantité</th><th class="right">Prix unitaire</th><th>TVA</th><th class="right">Montant</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucune ligne</td></tr>'}</tbody></table><section class="summary"><div class="sum-row gold"><span>Montant HT</span><b>${money(totals.total_ht)}</b></div><div class="sum-row"><span>TVA 20%</span><b>${money(totals.tva)}</b></div><div class="sum-row"><span>Total</span><b>${money(totals.total_ttc)}</b></div><div class="sum-row"><span>Payé le ${formatDate(f.paye_le) || ''}</span><b>${money(paid)}</b></div><div class="sum-row strong"><span>Montant dû</span><b>${money(due)}</b></div><div class="sum-row gold"><span>Mode de Règlement :</span><b>${escapeHtml(f.mode_reglement || '')}</b></div></section>${f.notes ? `<div class="payment-note">${escapeHtml(f.notes)}</div>` : ''}<section class="footer"><div class="rule"></div>${ENTREPRISE.telephone} - ${ENTREPRISE.email} - TVA : ${ENTREPRISE.tva}<div class="page-no">Page : 1 / 1</div><div class="invoice-no">${escapeHtml(f.numero || '')}</div></section></main><script>window.onload = () => { document.title = ''; window.print(); };</script></body></html>`;
  const win = window.open('', '_blank'); win.document.write(html); win.document.close();
}
