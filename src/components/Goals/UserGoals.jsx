import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient.js';

function UserGoals() {
    const [goals, setGoals] = useState({
        target_calories: 2000,
        min_protein: 100,
        min_fiber: 25,
        max_fat: 70
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchGoals();
    }, []);

    async function fetchGoals() {
        const { data } = await supabase.from('user_goals').select('*').eq('user_label', 'default').single();
        if (data) setGoals(data);
    }

    async function saveGoals() {
        setLoading(true);
        const { error } = await supabase
            .from('user_goals')
            .upsert({ user_label: 'default', ...goals }, { onConflict: 'user_label' });

        if (!error) {
            setMessage('Goals updated successfully! 🚀');
            setTimeout(() => setMessage(''), 3000);
        }
        setLoading(false);
    }

    return (
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h2 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
                🎯 Set Nutritional Targets <span className="text-xs font-normal text-gray-400 italic">(Daily Per Person)</span>
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Max Calories</label>
                    <input
                        type="number"
                        className="w-full p-2 border border-gray-200 rounded-xl font-bold"
                        value={goals.target_calories}
                        onChange={(e) => setGoals({...goals, target_calories: parseInt(e.target.value)})}
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Min Protein (g)</label>
                    <input
                        type="number"
                        className="w-full p-2 border border-gray-200 rounded-xl font-bold"
                        value={goals.min_protein}
                        onChange={(e) => setGoals({...goals, min_protein: parseFloat(e.target.value)})}
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Min Fiber (g)</label>
                    <input
                        type="number"
                        className="w-full p-2 border border-gray-200 rounded-xl font-bold"
                        value={goals.min_fiber}
                        onChange={(e) => setGoals({...goals, min_fiber: parseFloat(e.target.value)})}
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Max Fat (g)</label>
                    <input
                        type="number"
                        className="w-full p-2 border border-gray-200 rounded-xl font-bold"
                        value={goals.max_fat}
                        onChange={(e) => setGoals({...goals, max_fat: parseFloat(e.target.value)})}
                    />
                </div>
            </div>

            <button
                onClick={saveGoals}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl transition-all shadow-lg shadow-indigo-100"
            >
                {loading ? 'Saving...' : 'Update Targets'}
            </button>
            {message && <p className="mt-3 text-center text-sm font-bold text-emerald-600 animate-bounce">{message}</p>}
        </div>
    );
}

export default UserGoals;