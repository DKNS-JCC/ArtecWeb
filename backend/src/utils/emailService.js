const nodemailer = require('nodemailer');

// Initialize transporter using environment variables or fallbacks for development (e.g. ethereal email)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    auth: {
        user: process.env.SMTP_USER || 'leola40@ethereal.email',
        pass: process.env.SMTP_PASS || 'J7vEtxhEwGZYC9E42P'
    }
});

/**
 * Sends a welcome email with temporary credentials to newly created staff.
 * @param {string} toEmail Recipient email address
 * @param {string} name User's name
 * @param {string} tempPassword Temporary password
 * @param {string} role User role (museum_admin, technician)
 * @param {string} museumName Museum the user belongs to
 */
const sendWelcomeEmail = async (toEmail, name, tempPassword, role, museumName) => {
    const loginUrl = process.env.VITE_URL || 'http://localhost:5173/login';

    const mailOptions = {
        from: '"Artec Robotics" <no-reply@artec.local>',
        to: toEmail,
        subject: 'Bienvenido a Artec Robotics - Credenciales de Acceso',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #2563eb; text-align: center;">Artec Robotics</h2>
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
                
                <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 40px;">
                    Este es un correo automático. Por favor, no respondas a este mensaje.
                </p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Welcome email sent successfully: %s', info.messageId);

        // Return preview URL if using Ethereal (for development)
        if (transporter.options.host === 'smtp.ethereal.email') {
            const previewUrl = nodemailer.getTestMessageUrl(info);
            console.log('Preview URL: %s', previewUrl);
            return previewUrl;
        }

        return true;
    } catch (error) {
        console.error('Error sending welcome email:', error);
        return false;
    }
};

module.exports = {
    sendWelcomeEmail
};
