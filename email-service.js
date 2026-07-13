/* =============================================================
   ANTIGRAVITY CHESS — Email Service (email-service.js)
   Integrates with Resend to send onboarding and welcome emails
   ============================================================= */

export async function sendWelcomeEmail(email, username) {
    const apiKey = "re_7Yyry6ch_LLqqgYGiy8o6bcvWQ3ApsuRr";
    const appUrl = window.location.origin;
    
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Antigravity Chess</title>
        <style>
            body {
                font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: #0c0d0d;
                color: #f8fafc;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
            }
            .wrapper {
                width: 100%;
                background-color: #0c0d0d;
                padding: 40px 20px;
                box-sizing: border-box;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #161718;
                border: 1px solid #27272a;
                border-radius: 16px;
                padding: 40px;
                box-sizing: border-box;
            }
            .logo {
                font-size: 40px;
                color: #baca2b;
                text-align: center;
                margin-bottom: 20px;
            }
            .title {
                font-size: 24px;
                font-weight: 800;
                text-align: center;
                margin-bottom: 10px;
                color: #ffffff;
            }
            .subtitle {
                font-size: 16px;
                color: #a1a1aa;
                text-align: center;
                margin-bottom: 30px;
            }
            .divider {
                height: 1px;
                background-color: #27272a;
                margin: 30px 0;
            }
            .features {
                margin-bottom: 30px;
            }
            .feature-item {
                margin-bottom: 15px;
                display: flex;
                align-items: flex-start;
            }
            .feature-icon {
                font-size: 20px;
                margin-right: 12px;
                color: #baca2b;
                line-height: 1;
            }
            .feature-text {
                font-size: 15px;
                color: #e4e4e7;
                line-height: 1.5;
            }
            .btn-container {
                text-align: center;
                margin: 40px 0 20px;
            }
            .btn {
                background-color: #baca2b;
                color: #0c0d0d !important;
                text-decoration: none;
                padding: 14px 28px;
                font-weight: 800;
                font-size: 16px;
                border-radius: 8px;
                display: inline-block;
                transition: background-color 0.2s;
            }
            .footer {
                text-align: center;
                font-size: 12px;
                color: #71717a;
                margin-top: 40px;
            }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <div class="logo">♞</div>
                <div class="title">Welcome, ${username}!</div>
                <div class="subtitle">Thanks for joining Antigravity Chess. Your account is ready.</div>
                
                <div class="divider"></div>
                
                <div class="features">
                    <h3 style="color:#ffffff; font-size:16px; margin-bottom:15px; text-align:left;">Here is what you can do on the platform:</h3>
                    
                    <div class="feature-item">
                        <span class="feature-icon">🤖</span>
                        <div class="feature-text"><strong>Play against AI:</strong> Challenge our revamped 6-tier engine ranging from Easy to Grandmaster.</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">🧩</span>
                        <div class="feature-text"><strong>Solve Chess Puzzles:</strong> Sharp tactics training with immediate stats saving.</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">🎓</span>
                        <div class="feature-text"><strong>Learn Chess:</strong> Go through guided lessons to step up your rating.</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">📊</span>
                        <div class="feature-text"><strong>Track History:</strong> Review your games and monitor your win rate.</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">🏆</span>
                        <div class="feature-text"><strong>Earn Achievements:</strong> Unlock badges as you hit chess milestones.</div>
                    </div>
                </div>
                
                <div class="btn-container">
                    <a href="${appUrl}" class="btn" target="_blank">Start Playing</a>
                </div>
                
                <div class="divider"></div>
                
                <div class="footer">
                    &copy; 2026 Antigravity Chess. All rights reserved.<br>
                    You are receiving this because you registered at ${appUrl}.
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "Antigravity Chess <onboarding@resend.dev>",
                to: email,
                subject: `Welcome to Antigravity Chess, ${username}! ♞`,
                html: htmlContent
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error("Resend API returned error:", response.status, errData);
        } else {
            console.log("Welcome email successfully sent via Resend.");
        }
    } catch (e) {
        console.error("Failed to send welcome email gracefully:", e);
    }
}
