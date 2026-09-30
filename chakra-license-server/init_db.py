import asyncio
import asyncpg
import os

async def init_db():
    url = "postgresql://neondb_owner:npg_xnNVshia1IP8@ep-misty-wildflower-ax7kbvcc-pooler.c-4.us-east-2.aws.neon.tech/chakra_ivr_core?sslmode=require"
    print("Connecting to new Neon Database (chakra_ivr_core)...")
    try:
        conn = await asyncpg.connect(url)
        print("Connected! Creating licenses table...")
        
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS licenses (
                id SERIAL PRIMARY KEY,
                token TEXT UNIQUE NOT NULL,
                company_name TEXT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                used_minutes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ''')
        
        print("Table 'licenses' created successfully in chakra_ivr_core!")
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(init_db())
