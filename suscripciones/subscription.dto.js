function toBoolean(value) {
	return value === true || value === 1 || value === '1' || value === 'true';
}

function toIsoDate(value) {
	if (value === null || value === undefined || value === '') return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeSubscription(subscription) {
	if (!subscription) return subscription;
	const plan = subscription.plan || null;
	return {
		...subscription,
		plan_id: subscription.plan_id ?? plan?.id ?? null,
		current_period_end: toIsoDate(subscription.current_period_end),
		cancel_at_period_end: toBoolean(subscription.cancel_at_period_end)
	};
}

export function toSubscriptionResponse(subscription) {
	return { data: normalizeSubscription(subscription) };
}

export function toSubscriptionListResponse(subscriptions) {
	return { data: (subscriptions || []).map(normalizeSubscription) };
}
