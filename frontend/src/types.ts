export interface Account {
  id: number;
  name: string;
  initial: string;
  address: string;
  contact: string | null;
  unread: number;
}

export interface Me {
  domain: string;
  active: number | null;
  accounts: Account[];
}

export interface MailSummary {
  id: number;
  from: string;
  subject: string;
  receivedAt: number;
  unread: boolean;
  starred: boolean;
  preview: string;
}

export interface MailDetail {
  id: number;
  from: string;
  fromAddress: string;
  subject: string;
  body: string;
  receivedAt: number;
}

export interface AdminUser {
  id: number;
  name: string;
  address: string;
  contact: string | null;
  createdAt: number;
  mails: number;
  unread: number;
}

export type SigninResult = { ok: true } | { needCode: true; ticket: string; hint: string };
