import { describe, it, expect } from "vitest";
import { NotificationTemplates } from "../../src/modules/notifications/notification-templates.js";

describe("Notification Templates Engine", () => {
  it("formats applicationCreated template properly", () => {
    const result = NotificationTemplates.applicationCreated({
      clientName: "Jane Doe",
      applicationNumber: "SD-APP-2026-0001",
      serviceName: "Business Name Registration",
    });

    expect(result.title).toContain("SD-APP-2026-0001");
    expect(result.html).toContain("Jane Doe");
    expect(result.html).toContain("Business Name Registration");
    expect(result.sms).toContain("SD-APP-2026-0001");
  });

  it("formats clientActionRequired template properly", () => {
    const result = NotificationTemplates.clientActionRequired({
      clientName: "Jane Doe",
      applicationNumber: "SD-APP-2026-0001",
      serviceName: "Company Incorporation",
      actionTitle: "Upload Second Director KRA PIN",
      actionDescription: "Please provide verified KRA PIN certificate",
      deadline: new Date("2026-08-20"),
    });

    expect(result.title).toContain("Upload Second Director KRA PIN");
    expect(result.html).toContain("Action Required from You");
    expect(result.sms).toContain("SD-APP-2026-0001");
  });

  it("formats governmentUpdate template properly", () => {
    const result = NotificationTemplates.governmentUpdate({
      clientName: "Jane Doe",
      applicationNumber: "SD-APP-2026-0001",
      agency: "Business Registration Service",
      status: "QUERY_RAISED",
      externalReference: "BRS-APP-9988",
    });

    expect(result.title).toContain("Government Update");
    expect(result.html).toContain("QUERY_RAISED");
    expect(result.html).toContain("BRS-APP-9988");
  });

  it("formats documentExpiryWarning template properly", () => {
    const result = NotificationTemplates.documentExpiryWarning({
      clientName: "Jane Doe",
      documentTitle: "Tax Compliance Certificate",
      expiryDate: new Date("2026-09-01"),
    });

    expect(result.title).toContain("Tax Compliance Certificate");
    expect(result.html).toContain("Document Expiry Reminder");
    expect(result.sms).toContain("Tax Compliance Certificate");
  });
});
