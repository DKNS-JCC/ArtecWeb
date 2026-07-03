const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

/**
 * Envuelve el contenido específico de cada correo en la plantilla común de Artec:
 * contenedor con marco, cabecera de marca y pie de "correo automático". Así los
 * dos correos comparten un único layout y solo aportan su cuerpo.
 * @param {string} contenido HTML interno propio del mensaje
 * @returns {string} HTML completo del correo
 */
const renderEmailLayout = (contenido) => `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #2563eb; text-align: center;">Artec Robotics</h2>
                    ${contenido}
                    <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 40px;">
                        Este es un correo automático. Por favor, no respondas a este mensaje.
                    </p>
                </div>
            `;

/**
 * Envía un correo de bienvenida con credenciales temporales al personal recién creado.
 * @param {string} toEmail Dirección de correo del destinatario
 * @param {string} name Nombre del usuario
 * @param {string} tempPassword Contraseña temporal
 * @param {string} role Rol del usuario (museum_admin, technician)
 * @param {string} museumName Museo al que pertenece el usuario
 */
const sendWelcomeEmail = async (toEmail, name, tempPassword, role, museumName) => {
    const loginUrl = process.env.APP_URL || 'http://localhost:5173/login';

    try {
        await transporter.sendMail({
            from: `"Artec Robotics" <${process.env.GMAIL_USER}>`,
            to: toEmail,
            subject: 'Bienvenido a Artec Robotics - Credenciales de Acceso',
            html: renderEmailLayout(`
                    <p>Hola <strong>${name}</strong>,</p>
                    <p>Se ha creado una cuenta para ti en la plataforma de gestión de sistemas robóticos de Artec.</p>

                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 0 0 10px 0;"><strong>Rol asignado:</strong> ${role.toUpperCase()}</p>
                        ${museumName ? `<p style="margin: 0 0 10px 0;"><strong>Museo/Instalación:</strong> ${museumName}</p>` : ''}
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
                        <p style="margin: 0 0 5px 0;"><strong>Nombre:</strong> ${name}</p>
                        <p style="margin: 0;"><strong>Contraseña temporal:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${tempPassword}</span></p>
                    </div>

                    <p>Por motivos de seguridad, el sistema requerirá que cambies esta contraseña obligatoriamente la primera vez que inicies sesión.</p>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${loginUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Acceder a la plataforma</a>
                    </div>
            `)
        });

        return true;
    } catch (error) {
        console.error('Error sending welcome email:', error);
        return false;
    }
};

/**
 * Envía un enlace de recuperación de contraseña a un miembro del personal.
 * @param {string} toEmail Dirección de correo del destinatario
 * @param {string} name    Nombre del usuario
 * @param {string} rawToken Token de recuperación en texto plano (sin hashear)
 */
const sendPasswordResetEmail = async (toEmail, name, rawToken) => {
    const appUrl   = process.env.APP_URL || 'http://localhost:5173';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    try {
        await transporter.sendMail({
            from:    `"Artec Robotics" <${process.env.GMAIL_USER}>`,
            to:      toEmail,
            subject: 'Recuperación de contraseña - Artec Robotics',
            html: renderEmailLayout(`
                    <p>Hola <strong>${name}</strong>,</p>
                    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
                    <p>Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace es válido durante <strong>1 hora</strong>.</p>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}"
                           style="background-color: #2563eb; color: white; padding: 14px 28px;
                                  text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">
                            Restablecer contraseña
                        </a>
                    </div>

                    <p style="font-size: 13px; color: #64748b;">
                        Si no solicitaste este cambio, puedes ignorar este correo.
                        Tu contraseña actual seguirá siendo válida.
                    </p>
            `)
        });
        return true;
    } catch (error) {
        console.error('Error sending password reset email:', error);
        return false;
    }
};

module.exports = {
    sendWelcomeEmail,
    sendPasswordResetEmail
};
