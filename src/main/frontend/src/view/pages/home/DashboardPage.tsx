import { Link } from "@tanstack/react-router";

export default function DashboardPage() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-8 dark:text-white">Cloud Services</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Type-safe Link to dynamic route */}
                <Link to="/app/firestore" className="block group">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded flex items-center justify-center text-yellow-600 dark:text-yellow-500 text-2xl">
                                🔥
                            </div>
                            <h2 className="text-xl font-semibold dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Firestore</h2>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Manage documents and collections in your NoSQL document database.
                        </p>
                    </div>
                </Link>

                {/* Mock Unreleased Service */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm opacity-60 h-full relative">
                    <div className="absolute top-4 right-4 bg-gray-200 dark:bg-gray-700 text-xs px-2 py-1 rounded text-gray-600 dark:text-gray-300">Coming Soon</div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded flex items-center justify-center text-blue-600 dark:text-blue-500 text-2xl">
                            🔍
                        </div>
                        <h2 className="text-xl font-semibold dark:text-white">BigQuery</h2>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                        A fully managed, serverless enterprise data warehouse.
                    </p>
                </div>
            </div>
        </div>
    );
}