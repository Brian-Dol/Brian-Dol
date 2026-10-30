import { writeFileSync, mkdirSync } from 'node:fs';

const USER = process.env.STATS_USER || 'Brian-Dol';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) throw new Error('GITHUB_TOKEN is required');

const query = `
query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]) { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    contributionsCollection { totalCommitContributions restrictedContributionsCount }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100, privacy: PUBLIC, orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-stats' },
  body: JSON.stringify({ query, variables: { login: USER } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || res.statusText));
const u = json.data.user;

const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
const commits = u.contributionsCollection.totalCommitContributions + u.contributionsCollection.restrictedContributionsCount;

const langs = new Map();
for (const r of u.repositories.nodes) {
  for (const e of r.languages.edges) {
    const cur = langs.get(e.node.name) || { size: 0, color: e.node.color || '#8b949e' };
    cur.size += e.size;
    langs.set(e.node.name, cur);
  }
}
const topLangs = [...langs.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6);
const total = topLangs.reduce((a, [, v]) => a + v.size, 0) || 1;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const font = "font-family=\"Segoe UI, Ubuntu, Helvetica, Arial, sans-serif\"";

const rows = [
  ['⭐', 'Total stars earned', stars],
  ['🕘', 'Commits (last year)', commits],
  ['🔀', 'Pull requests', u.pullRequests.totalCount],
  ['🐛', 'Issues', u.issues.totalCount],
  ['📦', 'Public repositories', u.repositories.totalCount],
  ['🤝', 'Contributed to', u.repositoriesContributedTo.totalCount],
];
const statsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="190" viewBox="0 0 420 190" role="img" aria-label="GitHub stats for ${esc(USER)}">
  <rect width="420" height="190" rx="10" fill="#0f172a" stroke="#1e293b"/>
  <text x="24" y="34" ${font} font-size="18" font-weight="600" fill="#7aa2f7">${esc(USER)}'s GitHub Stats</text>
${rows.map(([i, label, v], k) => `  <text x="24" y="${66 + k * 24}" ${font} font-size="14" fill="#c0caf5">${i}  ${esc(label)}:</text>
  <text x="396" y="${66 + k * 24}" ${font} font-size="14" font-weight="700" fill="#e0af68" text-anchor="end">${esc(v)}</text>`).join('\n')}
</svg>
`;

const langHeight = 70 + topLangs.length * 24;
let bx = 24;
const barW = 372;
const bar = topLangs.map(([, v]) => {
  const w = (v.size / total) * barW;
  const seg = `<rect x="${bx.toFixed(1)}" y="46" width="${w.toFixed(1)}" height="10" fill="${esc(v.color)}"/>`;
  bx += w;
  return seg;
}).join('');
const langSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${Math.max(190, langHeight + 20)}" viewBox="0 0 420 ${Math.max(190, langHeight + 20)}" role="img" aria-label="Most used languages">
  <rect width="420" height="${Math.max(190, langHeight + 20)}" rx="10" fill="#0f172a" stroke="#1e293b"/>
  <text x="24" y="34" ${font} font-size="18" font-weight="600" fill="#7aa2f7">Most Used Languages</text>
  <clipPath id="c"><rect x="24" y="46" width="${barW}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#c)">${bar}</g>
${topLangs.map(([name, v], k) => `  <circle cx="30" cy="${82 + k * 24}" r="5" fill="${esc(v.color)}"/>
  <text x="44" y="${86 + k * 24}" ${font} font-size="14" fill="#c0caf5">${esc(name)}</text>
  <text x="396" y="${86 + k * 24}" ${font} font-size="14" fill="#a9b1d6" text-anchor="end">${((v.size / total) * 100).toFixed(1)}%</text>`).join('\n')}
</svg>
`;

mkdirSync('assets', { recursive: true });
writeFileSync('assets/github-stats.svg', statsSvg);
writeFileSync('assets/top-languages.svg', langSvg);
console.log('Generated assets/github-stats.svg and assets/top-languages.svg');
