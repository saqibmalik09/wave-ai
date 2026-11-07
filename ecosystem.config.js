/**
 * PM2 process for AiWave (production).
 *
 * Serves plain HTTP on port 3005 via the same command as `npm start`
 * (`next start -p 3005`). Next.js does not terminate TLS here, and this
 * process does not look for a local certificate. Put a reverse proxy in
 * front if a deployment needs HTTPS.
 *
 * PORT is set in the process environment (not .env) because Next.js binds
 * the server before env files are loaded. `-p 3005` is the same flag.
 */
module.exports = {
  apps: [
    {
      name: "aiwave-front",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3005",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: "3005",
      },
    },
  ],
};
