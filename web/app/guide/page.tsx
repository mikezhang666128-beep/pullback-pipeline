const card: React.CSSProperties = { border: "1px solid #1f2633", borderRadius: 10, padding: 18, marginBottom: 14, background: "#11151f" };
const pre: React.CSSProperties = { background: "#0b0e14", border: "1px solid #1f2633", borderRadius: 8, padding: "10px 12px", overflowX: "auto", fontSize: 12.5, color: "#86efac", whiteSpace: "pre", margin: "6px 0" };
const h2: React.CSSProperties = { fontSize: 18, margin: "0 0 12px" };
const dim: React.CSSProperties = { color: "#8a93a6" };

export default function Guide() {
  return (
    <div style={{ lineHeight: 1.7, fontSize: 14.5, color: "#cbd5e1" }}>
      <a href="/" style={{ color: "#3b82f6", textDecoration: "none", fontSize: 14 }}>&larr; Back to dashboard</a>
      <h1 style={{ fontSize: 24, margin: "12px 0 6px" }}>Instructions</h1>
      <p style={dim}>How the tool works, how to use it, and how to keep it running.</p>

      <div style={card}>
        <h2 style={h2}>What it does</h2>
        <p>This automates the germ-layer pipeline: you point it at a raw embryo image on crunch and it runs
        <b> downsample &rarr; Ilastik segmentation &rarr; meshing</b> automatically and gives you back the mesh
        <code> .obj</code>. No VNC, no Jupyter. The UV-unwrap + pullback step is still done in Blender for now.</p>
        <p style={dim}>Behind the scenes: the website queues a job in a cloud database; a worker program on the lab box
        (qbio-vip10) watches that queue, reads your file in place on crunch, runs the steps, and uploads the result so you
        can download it. Files never leave crunch; nothing shared is overwritten.</p>
      </div>

      <div style={card}>
        <h2 style={h2}>How to use it</h2>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li><b>Sign in</b> (make an account if it&rsquo;s your first time).</li>
          <li>Set up your <b>Profile</b> (top-right) &mdash; name, photo, description &mdash; so you show up on the leaderboard.</li>
          <li>Pick a <b>Marker</b>, then click the <b>Stage</b> chip that matches your embryo (green = a trained classifier is ready).
            If your stage is missing or shows &ldquo;untrained,&rdquo; upload a trained <code>.ilp</code> in the Classifier library.</li>
          <li>Paste the full <b>crunch path</b> to your raw <code>.tif</code>. <b>Timepoint</b> auto-fills from the filename.</li>
          <li>Leave <b>Output dir</b> as-is (results go to your own folder) and <b>Output</b> on <b>&ldquo;Mesh only.&rdquo;</b></li>
          <li>Click <b>Generate mesh</b>. Watch the steps go green; the timer shows elapsed time. No need to refresh.</li>
          <li>Click <b>Download</b> to get the <code>.obj</code>, then open it in <b>Blender</b> (or Windows 3D Viewer) for the UV + pullback.
            <span style={dim}> A <code>.obj</code> is a text file &mdash; opening it in Notepad shows numbers, which is normal.</span></li>
        </ol>
      </div>

      <div style={card}>
        <h2 style={h2}>Classifier library</h2>
        <p>Ilastik needs a trained <code>.ilp</code> to segment, and it&rsquo;s <b>stage-specific</b>: an 8&nbsp;hpf classifier
        segments 6&nbsp;hpf data poorly, and vice-versa. So the library keeps a separate classifier per <b>marker + stage</b>
        (e.g. <code>pMyo @ 6hpf</code>, <code>pMyo @ 8hpf</code>). Upload a trained <code>.ilp</code> once per marker+stage and everyone reuses it;
        delete or swap anytime. (The Blender sphere needs no library &mdash; it&rsquo;s just geometry, one sphere for every embryo.)</p>
      </div>

      <div style={card}>
        <h2 id="worker" style={h2}>Worker reset (admin)</h2>
        <p>If jobs sit on <b>&ldquo;queued&rdquo;</b> and never move, the worker on the lab box needs a restart.
        Open <b>LXTerminal</b> on qbio-vip10 and run these <b>one line at a time</b>:</p>
        <div style={{ fontWeight: 600 }}>Restart (keeps running after logout):</div>
        <pre style={pre}>{`cd ~/pullback-pipeline-main
git pull origin main
pkill -f worker.py
cd worker
nohup ~/miniconda3/envs/mike_btc/bin/python -u worker.py --config config.toml > ~/worker.log 2>&1 &`}</pre>
        <div style={{ fontWeight: 600, marginTop: 8 }}>Check it&rsquo;s alive:</div>
        <pre style={pre}>{`pgrep -f worker.py      # a number = running
tail -n 20 ~/worker.log`}</pre>
        <p style={dim}>The startup line must show <code>caps=[...'downsample','ilastik_predict','mesh','pullback']</code>.
        If a step is missing there, the queue stalls. Full rebuild + troubleshooting: <code>docs/WORKER_RESET.md</code> in the repo.</p>
      </div>

      <div style={card}>
        <h2 style={h2}>Good to know</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Each person only sees their own runs; outputs go to a per-user folder.</li>
          <li>The run timer freezes into a &ldquo;done in M:SS&rdquo; record when it finishes.</li>
          <li>The raw file must already be on <b>crunch</b> (11&nbsp;GB files don&rsquo;t upload through a browser) &mdash; you give the path, not the file.</li>
          <li>The cloud (site + database) is the source of truth; the lab box is replaceable compute.</li>
        </ul>
      </div>

      <a href="/" style={{ color: "#3b82f6", textDecoration: "none", fontSize: 14 }}>&larr; Back to dashboard</a>
    </div>
  );
}
