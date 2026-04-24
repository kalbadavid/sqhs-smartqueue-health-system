import React, { useState } from 'react';
import axios from 'axios';

const PredictWaitTime = () => {
  const [formData, setFormData] = useState({
    hour_of_day: '',
    day_of_week: '',
    month: '',
    medication_revenue: '',
    lab_cost: '',
    consultation_revenue: '',
    doctor_type: 'ANCHOR',
    financial_class: 'Self-Pay',
    patient_type: 'New'
  });

  const [waitTimes, setWaitTimes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // Parse numeric fields
    const parsedData = {
      ...formData,
      hour_of_day: parseInt(formData.hour_of_day, 10),
      day_of_week: parseInt(formData.day_of_week, 10),
      month: parseInt(formData.month, 10),
      medication_revenue: parseFloat(formData.medication_revenue),
      lab_cost: parseFloat(formData.lab_cost),
      consultation_revenue: parseFloat(formData.consultation_revenue),
    };

    try {
      const response = await axios.post('http://localhost:8000/predict', parsedData);
      const prediction = response.data.estimated_wait_time_minutes;
      
      const newPatient = {
        ...parsedData,
        waitTime: prediction,
        id: Date.now()
      };
      
      setWaitTimes(prev => [newPatient, ...prev]);
      
      // Reset numeric fields to make entry easier for next
      setFormData(prev => ({
        ...prev,
        hour_of_day: '',
        day_of_week: '',
        month: '',
        medication_revenue: '',
        lab_cost: '',
        consultation_revenue: ''
      }));
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Error occurred predicting wait time');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-full min-h-screen bg-slate-50">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-blue-900 mb-2">
          SQHS Hospital Queue Management
        </h1>
        <p className="text-lg text-blue-600">Smart Patient Registration & Wait Time Prediction</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Registration Form */}
        <div className="lg:col-span-5 bg-white rounded-xl shadow-lg border border-blue-100 overflow-hidden">
          <div className="bg-blue-600 px-6 py-4">
            <h2 className="text-xl font-bold text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Patient Registration
            </h2>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">{error}</div>}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Doctor Type</label>
                <select name="doctor_type" value={formData.doctor_type} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border">
                  <option value="ANCHOR">ANCHOR</option>
                  <option value="FLOATING">FLOATING</option>
                  <option value="LOCUM">LOCUM</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Patient Type</label>
                <select name="patient_type" value={formData.patient_type} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border">
                  <option value="New">New</option>
                  <option value="Returning">Returning</option>
                  <option value="Follow-up">Follow-up</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Financial Class</label>
                <select name="financial_class" value={formData.financial_class} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border">
                  <option value="Self-Pay">Self-Pay</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Medicare">Medicare</option>
                  <option value="Medicaid">Medicaid</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Month (1-12)</label>
                <input type="number" min="1" max="12" name="month" value={formData.month} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Entry Hour (0-23)</label>
                <input type="number" min="0" max="23" name="hour_of_day" value={formData.hour_of_day} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Day of Week (0-6)</label>
                <input type="number" min="0" max="6" name="day_of_week" value={formData.day_of_week} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border" placeholder="0=Mon, 6=Sun" />
              </div>
            </div>

            <hr className="border-slate-200 my-4" />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Medication Rev($)</label>
                <input type="number" step="0.01" min="0" name="medication_revenue" value={formData.medication_revenue} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lab Cost ($)</label>
                <input type="number" step="0.01" min="0" name="lab_cost" value={formData.lab_cost} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Consult Rev ($)</label>
                <input type="number" step="0.01" min="0" name="consultation_revenue" value={formData.consultation_revenue} onChange={handleChange} required className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-2 border" />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="mt-6 w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Predicting Wait Time...
                </span>
              ) : 'Register & Predict Wait Time'}
            </button>
          </form>
        </div>

        {/* Results Queue Table */}
        <div className="lg:col-span-7">
          {waitTimes.length > 0 && (
            <div className="bg-white rounded-xl shadow border border-blue-50 mb-6 overflow-hidden animate-fade-in-up">
              <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-blue-900">Latest Prediction</h3>
                  <p className="text-sm text-blue-600">Patient just registered</p>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg border border-blue-200 shadow-sm flex items-center">
                  <span className="text-slate-500 text-sm mr-2">Estimated Wait:</span>
                  <span className="text-2xl font-black text-blue-700">{waitTimes[0].waitTime} <span className="text-sm font-medium text-slate-500">min</span></span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Current Queue Predictions
              </h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {waitTimes.length} Patients
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Patient Details</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Time Info</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Financials (\$)</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Estimated Wait</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {waitTimes.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-slate-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        No patients in the queue yet.<br/>
                        Register a patient to see their predicted wait time.
                      </td>
                    </tr>
                  ) : (
                    waitTimes.map((patient, idx) => (
                      <tr key={patient.id} className={idx === 0 ? "bg-blue-50/30" : "hover:bg-slate-50"}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900">{patient.patient_type} / {patient.financial_class}</div>
                          <div className="text-sm text-slate-500">Dr: {patient.doctor_type}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900">Hour: {patient.hour_of_day}:00</div>
                          <div className="text-sm text-slate-500">Day: {patient.day_of_week}, Month: {patient.month}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          Med: {patient.medication_revenue.toFixed(2)}<br/>
                          Lab: {patient.lab_cost.toFixed(2)}<br/>
                          Con: {patient.consultation_revenue.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold">
                          <span className={`${
                            patient.waitTime > 60 ? 'text-red-600' : 
                            patient.waitTime > 30 ? 'text-amber-600' : 
                            'text-emerald-600'
                          }`}>
                            {patient.waitTime} min
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictWaitTime;
