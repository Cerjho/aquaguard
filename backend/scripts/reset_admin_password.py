"""Reset admin password to a simple known value."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from extensions import db, bcrypt
from models import User

app = create_app()
with app.app_context():
    admin = User.query.filter_by(username='admin').first()

    if admin:
        # Set password to: aquaguard2026
        new_password = 'aquaguard2026'
        admin.password_hash = bcrypt.generate_password_hash(new_password).decode('utf-8')
        admin.is_active = True  # Ensure user is active!
        db.session.commit()
        print(f"✅ Admin password reset to: {new_password}")
        print("   Username: admin")
        print(f"   Password: {new_password}")
        print(f"   is_active: {admin.is_active}")

        # Verify the password works
        if bcrypt.check_password_hash(admin.password_hash, new_password):
            print("✅ Password verification: SUCCESS")
        else:
            print("❌ Password verification: FAILED")
    else:
        print("❌ Admin user not found! Creating one...")
        admin = User(
            username='admin',
            password_hash=bcrypt.generate_password_hash('aquaguard2026').decode('utf-8'),
            role='admin',
            is_active=True
        )
        db.session.add(admin)
        db.session.commit()
        print("✅ Admin user created!")
        print("   Username: admin")
        print("   Password: aquaguard2026")
