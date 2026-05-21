module.exports = {
  apps: [
    {
      name: 'warehouse-api',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
      },
      out_file: './logs/api-out.log',
      error_file: './logs/api-err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
