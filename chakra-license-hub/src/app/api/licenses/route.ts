import { NextResponse } from "next/server";
import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Mock database for when Postgres isn't connected yet
let mockLicenses = [
  { id: "1", company_name: "AgroCorp Sri Lanka", token: "chk_live_agrocorp123", is_active: true, used_minutes: 142, package_name: "Growth" },
  { id: "2", company_name: "Island Tours Pvt Ltd", token: "chk_live_tour456", is_active: false, used_minutes: 1050, package_name: "Starter" },
];

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(mockLicenses);
  }

  try {
    const result = await pool.query("SELECT * FROM licenses ORDER BY created_at DESC");
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json({ error: "Failed to fetch licenses" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { companyName, packageName } = await request.json();
    
    if (!companyName) {
      return NextResponse.json({ error: "Company Name is required" }, { status: 400 });
    }

    let newToken = `chk_live_${crypto.randomBytes(32).toString("hex")}`;

    if (!process.env.DATABASE_URL) {
      // Mock logic
      const newLicense = {
        id: Math.random().toString(36).substr(2, 9),
        company_name: companyName,
        token: newToken,
        is_active: true,
        used_minutes: 0,
        package_name: packageName || "Starter",
      };
      mockLicenses = [newLicense, ...mockLicenses];
      return NextResponse.json(newLicense);
    }

    // Real DB logic
    const query = `
      INSERT INTO licenses (token, company_name, is_active, used_minutes, package_name, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `;
    const values = [newToken, companyName, true, 0, packageName || "Starter"];
    
    const result = await pool.query(query, values);
    return NextResponse.json(result.rows[0]);

  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json({ error: "Failed to create license" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, action, companyName, isActive } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      // Mock logic
      const licenseIndex = mockLicenses.findIndex(l => l.id === id);
      if (licenseIndex === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
      
      if (action === 'edit' && companyName) {
        mockLicenses[licenseIndex].company_name = companyName;
      } else if (action === 'toggle_status') {
        mockLicenses[licenseIndex].is_active = isActive !== undefined ? isActive : !mockLicenses[licenseIndex].is_active;
      }
      return NextResponse.json(mockLicenses[licenseIndex]);
    }

    // Real DB logic
    if (action === 'edit' && companyName) {
      const result = await pool.query("UPDATE licenses SET company_name = $1 WHERE id = $2 RETURNING *", [companyName, id]);
      return NextResponse.json(result.rows[0]);
    } else if (action === 'toggle_status') {
      const result = await pool.query("UPDATE licenses SET is_active = $1 WHERE id = $2 RETURNING *", [isActive, id]);
      return NextResponse.json(result.rows[0]);
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json({ error: "Failed to update license" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      // Mock logic
      mockLicenses = mockLicenses.filter(l => l.id !== id);
      return NextResponse.json({ success: true });
    }

    // Real DB logic
    await pool.query("DELETE FROM licenses WHERE id = $1", [id]);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json({ error: "Failed to delete license" }, { status: 500 });
  }
}
