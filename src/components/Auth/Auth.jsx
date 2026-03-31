import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient'

export default function Auth() {
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isSignUp, setIsSignUp] = useState(false)

    const handleAuth = async (e) => {
        e.preventDefault()
        setLoading(true)

        // This tells Supabase to either create a user or check a password
        const { error } = isSignUp
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password })

        if (error) {
            alert(error.message)
        } else if (isSignUp) {
            alert('Check your email for the confirmation link! (Or check Supabase dashboard if you turned off confirmation)')
        }
        setLoading(false)
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter">
                        {isSignUp ? 'Create Account' : 'Welcome Back'}
                    </h1>
                    <p className="text-gray-400 text-sm font-medium mt-2">
                        {isSignUp ? 'Start your healthy journey today' : 'Log in to manage your meals'}
                    </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1 tracking-widest text-gray-400">Email Address</label>
                        <input
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:border-indigo-500 transition-all font-medium text-gray-900"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1 tracking-widest text-gray-400">Password</label>
                        <input
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:border-indigo-500 transition-all font-medium text-gray-900"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-100 transition-all active:scale-95 mt-2"
                    >
                        {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
                    </button>
                </form>

                <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="w-full mt-6 text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors uppercase tracking-widest"
                >
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>
            </div>
        </div>
    )
}