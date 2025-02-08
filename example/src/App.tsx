import Spinner from './components/Spinner';
import { lazy, Suspense } from 'react';

const Code = lazy(() => import('./components/Code'));
const Actions = lazy(() => import('./components/Actions'));

const Github = lazy(() => import('./assets/Github'));
const Npm = lazy(() => import('./assets/Npm'));

const App = () => {
	const showSingleIframeOfSelf = window.parent === window;
	return (
		<div className="w-screen h-screen flex flex-col md:flex-row items-center justify-center gap-2 p-2 overflow-hidden">
			<div className="w-screen h-screen flex flex-col items-center justify-center gap-2 p-2 overflow-hidden">
				<div className="toast toast-top toast-start animate-in">
					<div className="alert flex items-center justify-center">
						<h1 className="font-semibold">use-post-message-ts</h1>
						<button className="btn btn-sm btn-neutral">v0.1.1</button>
					</div>
				</div>

				<div className="toast toast-top toast-end animate-in">
					<div className="alert flex flex-row gap-2">
						<button
							className="btn btn-square btn-sm"
							onClick={() => window.open('https://www.npmjs.com/package/use-post-message-ts', '_blank', 'noopener')}
						>
							<kbd className="kbd w-8 h-8">
								<Suspense fallback={<Spinner />}>
									<Npm />
								</Suspense>
							</kbd>
						</button>
						<button
							className="btn btn-square btn-sm"
							onClick={() => window.open('https://github.com/paulschoen/use-post-message', '_blank', 'noopener')}
						>
							<kbd className="kbd w-8 h-8">
								<Suspense fallback={<Spinner />}>
									<Github />
								</Suspense>
							</kbd>
						</button>
					</div>
				</div>

				<div className="flex h-12 md:hidden" />

				<Suspense
					fallback={
						<div className="flex items-center justify-center">
							<Spinner />
						</div>
					}
				>
					<div className="mockup-code animate-in w-full md:w-auto ">
						<Code />
					</div>
				</Suspense>

				<div className="flex justify-center items-center">
					<Suspense fallback={<Spinner />}>
						<Actions />
					</Suspense>
				</div>
			</div>
			{showSingleIframeOfSelf && (
				<iframe id="demo-iframe" src={window.location.href} className="mockup-iframe animate-in w-full h-full" />
			)}
		</div>
	);
};

export default App;
