module.exports = {
    apps: [
        {
            name: 'news-bot-scheduler',
            script: './scripts/run.js',
            watch: false,
            env: {
                NODE_ENV: 'production',
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: './logs/scheduler-error.log',
            out_file: './logs/scheduler-out.log',
        },
        {
            name: 'news-bot-dashboard',
            script: './scripts/server.js',
            watch: false,
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: './logs/dashboard-error.log',
            out_file: './logs/dashboard-out.log',
        }
    ]
};
