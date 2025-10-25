import { $, html, setView } from './utils.js';

export function renderDashboard(session){
  const root = html`
    <div class="card">
      <h3>Dashboard</h3>
      <p>Welcome, ${session?.email || 'user'}.</p>
      ${session?.role === 'superadmin' ? `<p><a href="#/admin/branches" class="btn">Manage Branches</a></p>` : ''}
    </div>
  `;
  setView(root);
}
