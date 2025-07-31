import { db } from "./client";

export async function connectToDb() {
  try {
    await db.$connect();
    console.log(`Connected to Database`);
  } catch (error) {
    console.error("Connection to database failed", error);
  }
}
