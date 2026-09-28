import { BillingHealth } from "@/components/dashboard/billing-health";
import { ChannelSalesChart } from "@/components/dashboard/channel-sales-chart";
import { DashboardActivity } from "@/components/dashboard/dashboard-activity";
import { DashboardInvoices } from "@/components/dashboard/dashboard-invoices";
import { NetRevenueChart } from "@/components/dashboard/net-revenue-chart";
import { DashboardStats } from "@/components/dashboard/stats";

export function Dashboard() {
	return (
		<div className="grid grid-cols-1 gap-px bg-border p-px md:grid-cols-2 lg:grid-cols-4">
			<DashboardStats />
			<NetRevenueChart />
			<ChannelSalesChart />
			<DashboardInvoices />
			<BillingHealth />
			<DashboardActivity />
		</div>
	);
}
