import { BonsWorkflowContext } from './bon-context';

/** Poste d'où la signature IT a été tracée : il figure au certificat de preuve. */
export interface ClientTrace {
  readonly ip: string;
  readonly userAgent: string;
}

/**
 * Signature IT recueillie dans une fenêtre de la fiche (déclaration de
 * non-restitution, équipement retrouvé) : enregistrée par le module
 * Signature, puis complétée de l'adresse IP et du navigateur du technicien,
 * pour que le certificat du PV ne dise pas « Adresse IP : — ». Ces deux champs
 * n'entrent pas dans le sceau de la signature : les compléter ne l'altère pas.
 */
export async function saveItSignatureWithTrace(
  ctx: BonsWorkflowContext,
  bonId: string,
  signatureDataUrl: string,
  actorId: string,
  client?: ClientTrace,
): Promise<void> {
  const user = await ctx.prisma.user.findUnique({ where: { id: actorId }, select: { email: true } });
  const before = new Date(Date.now() - 1000);
  await ctx.signatureService.saveItPvSignature(bonId, signatureDataUrl, user?.email ?? 'unknown', actorId);
  if (!client) return;
  await ctx.prisma.signature.updateMany({
    where: { bonId, type: 'it_cachet', signed: true, initiatedById: actorId, signedAt: { gte: before }, signerIp: null },
    data: { signerIp: client.ip, signerUserAgent: client.userAgent },
  });
}
